import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@dct-crm/db';
import { EffectivePermission } from '../services/effectivePermissions';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    tenantId: string;
    isSuperAdmin: boolean;
    impersonatedBy?: string;
    profileId?: string;
    profileName?: string;
    isAdmin?: boolean;
  };
  tenantId?: string;
  effectivePermissions?: EffectivePermission[];
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      email: string;
      tenantId: string;
      isSuperAdmin: boolean;
      impersonatedBy?: string;
    };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true, email: true, tenantId: true, isActive: true, isSuperAdmin: true,
        profileId: true,
        profile: { select: { id: true, name: true, isAdmin: true } },
        tenant: { select: { isActive: true, companyStartDate: true, companyExpiryDate: true } },
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    if (!user.tenant.isActive) {
      return res.status(403).json({ success: false, error: 'Company is inactive. Contact Super Admin.' });
    }

    if (!user.isSuperAdmin) {
      const now = new Date();
      if (user.tenant.companyStartDate && now < user.tenant.companyStartDate) {
        return res.status(403).json({ success: false, error: 'Company has not started yet. Access begins on ' + user.tenant.companyStartDate.toLocaleDateString() + '.' });
      }
      if (user.tenant.companyExpiryDate && now > user.tenant.companyExpiryDate) {
        return res.status(403).json({ success: false, error: 'Company subscription has expired. Contact Super Admin.' });
      }
    }

    req.user = {
      id: user.id,
      email: user.email,
      tenantId: user.tenantId,
      isSuperAdmin: user.isSuperAdmin,
      impersonatedBy: decoded.impersonatedBy,
      profileId: user.profileId || user.profile?.id || undefined,
      profileName: user.profile?.name || undefined,
      isAdmin: user.profile?.isAdmin || false,
    };
    req.tenantId = user.tenantId;

    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

export const generateToken = (user: { id: string; email: string; tenantId: string; isSuperAdmin: boolean; impersonatedBy?: string }) => {
  return jwt.sign(
    { id: user.id, email: user.email, tenantId: user.tenantId, isSuperAdmin: user.isSuperAdmin, impersonatedBy: user.impersonatedBy },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') as any }
  );
};

export const setAuthCookie = (res: Response, token: string) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  });
};