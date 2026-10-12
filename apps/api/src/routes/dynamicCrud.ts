import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  listRecords,
  getRecord,
  getRecordByNumber,
  createRecord,
  updateRecord,
  deleteRecord,
  bulkCreateRecords,
} from '../services/dynamicCrud';
import {
  getUserObjectPermissions,
  getUserFieldPermissions,
  getObjectDefinition,
  getRoleHierarchyUserIds,
} from '../services/metadata';

const router = Router();
router.use(authenticate);

async function checkObjectPermission(req: AuthRequest, objectName: string, action: 'create' | 'read' | 'update' | 'delete'): Promise<{ allowed: boolean; permissions: Awaited<ReturnType<typeof getUserObjectPermissions>> }> {
  if (req.user?.isSuperAdmin) return { allowed: true, permissions: null };

  const permissions = await getUserObjectPermissions(req.tenantId!, req.user!.id, objectName, req.user);
  if (!permissions) {
    const { EffectivePermissionService } = await import('../services/effectivePermissions');
    const perms = await EffectivePermissionService.getEffectivePermissionsCached(req.user!, req.user!.id);
    const hasFullAccess = perms.some((p) => p.name === 'FULL_SYSTEM_ACCESS');
    return { allowed: hasFullAccess, permissions: null };
  }

  switch (action) {
    case 'create': return { allowed: permissions.canCreate || permissions.modifyAll, permissions };
    case 'read': return { allowed: permissions.canRead || permissions.viewAll, permissions };
    case 'update': return { allowed: permissions.canUpdate || permissions.modifyAll, permissions };
    case 'delete': return { allowed: permissions.canDelete || permissions.modifyAll, permissions };
    default: return { allowed: false, permissions };
  }
}

async function canAccessOwnedRecord(req: AuthRequest, objectName: string, ownerId: string | null, action: 'read' | 'update' | 'delete') {
  const permissions = await getUserObjectPermissions(req.tenantId!, req.user!.id, objectName, req.user);
  if (!permissions) return true;
  if (permissions.modifyAll || (permissions.viewAll && action === 'read')) return true;

  const visibleUserIds = await getRoleHierarchyUserIds(req.tenantId!, req.user!.id);
  return ownerId !== null && visibleUserIds.includes(ownerId);
}

async function filterFieldsByPermission(
  data: Record<string, any>,
  fieldPermissions: { fieldName: string; canRead: boolean; canEdit: boolean }[],
  mode: 'read' | 'write'
): Promise<Record<string, any>> {
  if (!fieldPermissions || fieldPermissions.length === 0) return data;

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const perm = fieldPermissions.find(fp => fp.fieldName === key);
    if (mode === 'read') {
      if (!perm || perm.canRead) {
        result[key] = value;
      }
    } else {
      if (!perm || perm.canEdit) {
        result[key] = value;
      }
    }
  }
  return result;
}

router.get('/:objectName', async (req: AuthRequest, res: Response) => {
  try {
    const { objectName } = req.params;
    const { allowed, permissions: objectPermissions } = await checkObjectPermission(req, objectName, 'read');
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions to read this object' });
    }

    const object = await getObjectDefinition(req.tenantId!, objectName);
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const { page, limit, search, sortBy, sortOrder, ...filters } = req.query;
    const cleanFilters: Record<string, any> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (!key.startsWith('_') && key !== 'page' && key !== 'limit') {
        cleanFilters[key] = value;
      }
    }

    const result = await listRecords(req.tenantId!, objectName, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search: search as string,
      filters: Object.keys(cleanFilters).length > 0 ? cleanFilters : undefined,
      sortBy: sortBy as string,
      sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
      ownerIds: objectPermissions?.viewAll || objectPermissions?.modifyAll
        ? undefined
        : await getRoleHierarchyUserIds(req.tenantId!, req.user!.id),
    });

    const fieldPerms = await getUserFieldPermissions(req.tenantId!, req.user!.id, object.id);

    result.data = result.data.map((record: any) => {
      const filtered = { ...record };
      if (fieldPerms && fieldPerms.length > 0) {
        filtered.data = filterFieldsByPermission(record.data, fieldPerms, 'read');
      }
      return filtered;
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('List records error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch records' });
  }
});

router.get('/:objectName/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { objectName, id } = req.params;
    const { allowed } = await checkObjectPermission(req, objectName, 'read');
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions to read this object' });
    }

    const object = await getObjectDefinition(req.tenantId!, objectName);
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    let record = await getRecord(req.tenantId!, objectName, id);
    if (!record) {
      record = await getRecordByNumber(req.tenantId!, objectName, id);
    }
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    if (!(await canAccessOwnedRecord(req, objectName, record.ownerId, 'read'))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this record' });
    }

    const fieldPerms = await getUserFieldPermissions(req.tenantId!, req.user!.id, object.id);

    if (fieldPerms && fieldPerms.length > 0) {
      record.data = await filterFieldsByPermission(record.data, fieldPerms, 'read');
    }

    res.json({ success: true, data: record });
  } catch (error: any) {
    console.error('Get record error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch record' });
  }
});

router.post('/:objectName', async (req: AuthRequest, res: Response) => {
  try {
    const { objectName } = req.params;
    const { allowed } = await checkObjectPermission(req, objectName, 'create');
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions to create this object' });
    }

    const object = await getObjectDefinition(req.tenantId!, objectName);
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const fieldPerms = await getUserFieldPermissions(req.tenantId!, req.user!.id, object.id);
    const filteredData = await filterFieldsByPermission(req.body, fieldPerms, 'write');

    const record = await createRecord(req.tenantId!, objectName, filteredData, req.user!.id);
    res.status(201).json({ success: true, data: record });
  } catch (error: any) {
    console.error('Create record error:', error);
    if (error.message.includes('required') || error.message.includes('must be')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to create record' });
  }
});

router.put('/:objectName/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { objectName, id } = req.params;
    const { allowed } = await checkObjectPermission(req, objectName, 'update');
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions to update this object' });
    }

    const object = await getObjectDefinition(req.tenantId!, objectName);
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const existingRecord = await getRecord(req.tenantId!, objectName, id) || await getRecordByNumber(req.tenantId!, objectName, id);
    if (existingRecord && !(await canAccessOwnedRecord(req, objectName, existingRecord.ownerId, 'update'))) {
      return res.status(403).json({ success: false, error: 'You do not have access to update this record' });
    }

    const fieldPerms = await getUserFieldPermissions(req.tenantId!, req.user!.id, object.id);
    const filteredData = await filterFieldsByPermission(req.body, fieldPerms, 'write');

    const record = await updateRecord(req.tenantId!, objectName, id, filteredData, req.user!.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    res.json({ success: true, data: record });
  } catch (error: any) {
    console.error('Update record error:', error);
    if (error.message.includes('required') || error.message.includes('must be')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to update record' });
  }
});

router.delete('/:objectName/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { objectName, id } = req.params;
    const { allowed } = await checkObjectPermission(req, objectName, 'delete');
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions to delete this object' });
    }

    const existingRecord = await getRecord(req.tenantId!, objectName, id) || await getRecordByNumber(req.tenantId!, objectName, id);
    if (existingRecord && !(await canAccessOwnedRecord(req, objectName, existingRecord.ownerId, 'delete'))) {
      return res.status(403).json({ success: false, error: 'You do not have access to delete this record' });
    }

    const result = await deleteRecord(req.tenantId!, objectName, id, req.user!.id);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (error: any) {
    console.error('Delete record error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete record' });
  }
});

router.post('/:objectName/bulk', async (req: AuthRequest, res: Response) => {
  try {
    const { objectName } = req.params;
    const { allowed } = await checkObjectPermission(req, objectName, 'create');
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions to create records' });
    }

    const { records } = req.body;
    if (!Array.isArray(records)) {
      return res.status(400).json({ success: false, error: 'Records array is required' });
    }

    const result = await bulkCreateRecords(req.tenantId!, objectName, records, req.user!.id);
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    console.error('Bulk create error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create records' });
  }
});

export { router as dynamicCrudRoutes };