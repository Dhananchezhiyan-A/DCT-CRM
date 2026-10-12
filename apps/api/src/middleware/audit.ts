import { prisma } from '@dct-crm/db';

export const auditLog = async (
  tenantId: string,
  userId: string | undefined,
  action: string,
  objectType: string,
  objectId: string | undefined,
  oldValues?: any,
  newValues?: any,
  ipAddress?: string
) => {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action,
        objectType,
        objectId,
        oldValues: oldValues ? JSON.parse(JSON.stringify(oldValues)) : undefined,
        newValues: newValues ? JSON.parse(JSON.stringify(newValues)) : undefined,
        ipAddress,
      },
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
};
