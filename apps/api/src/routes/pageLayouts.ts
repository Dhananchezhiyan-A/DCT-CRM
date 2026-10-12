import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { getPageLayout, invalidateCache } from '../services/metadata';

const router = Router();
router.use(authenticate);

router.get('/:objectName', async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const layouts = await prisma.pageLayout.findMany({
      where: { objectId: object.id },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: layouts });
  } catch (error) {
    console.error('Get layouts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch layouts' });
  }
});

router.get('/:objectName/default', async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const layout = await getPageLayout(req.tenantId!, object.id);
    if (!layout) {
      return res.status(404).json({ success: false, error: 'No layout found' });
    }

    res.json({ success: true, data: layout });
  } catch (error) {
    console.error('Get default layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch default layout' });
  }
});

router.post('/:objectName', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const { name, isDefault, sections } = req.body;
    if (!name || !sections) {
      return res.status(400).json({ success: false, error: 'Name and sections are required' });
    }

    if (isDefault) {
      await prisma.pageLayout.updateMany({
        where: { objectId: object.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const layout = await prisma.pageLayout.create({
      data: {
        tenantId: req.tenantId!,
        objectId: object.id,
        name,
        isDefault: isDefault || false,
        sections: JSON.stringify(sections),
        createdBy: req.user!.id,
      },
    });

    invalidateCache(req.tenantId!, object.name);
    res.status(201).json({ success: true, data: layout });
  } catch (error) {
    console.error('Create layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to create layout' });
  }
});

router.put('/:objectName/:layoutId', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const existing = await prisma.pageLayout.findFirst({
      where: { id: req.params.layoutId, objectId: object.id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Layout not found' });
    }

    const { name, isDefault, sections } = req.body;

    if (isDefault) {
      await prisma.pageLayout.updateMany({
        where: { objectId: object.id, isDefault: true, id: { not: req.params.layoutId } },
        data: { isDefault: false },
      });
    }

    const layout = await prisma.pageLayout.update({
      where: { id: req.params.layoutId },
      data: {
        ...(name !== undefined && { name }),
        ...(isDefault !== undefined && { isDefault }),
        ...(sections !== undefined && { sections: JSON.stringify(sections) }),
        updatedBy: req.user!.id,
      },
    });

    invalidateCache(req.tenantId!, object.name);
    res.json({ success: true, data: layout });
  } catch (error) {
    console.error('Update layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to update layout' });
  }
});

router.delete('/:objectName/:layoutId', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const existing = await prisma.pageLayout.findFirst({
      where: { id: req.params.layoutId, objectId: object.id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Layout not found' });
    }

    if (existing.isDefault) {
      return res.status(400).json({ success: false, error: 'Cannot delete the default layout' });
    }

    await prisma.pageLayout.delete({ where: { id: req.params.layoutId } });

    invalidateCache(req.tenantId!, object.name);
    res.json({ success: true, message: 'Layout deleted successfully' });
  } catch (error) {
    console.error('Delete layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete layout' });
  }
});

export { router as pageLayoutRoutes };