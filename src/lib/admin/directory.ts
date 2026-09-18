import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';

/**
 * The admin portal is a read-only contact directory.
 *
 * Every query in this module selects contact fields only. Receipts, financial
 * totals, stored documents and password hashes are never read here, so the
 * portal cannot expose them even by mistake.
 */

export type RegisteredUserStatus = 'ACTIVE' | 'UNCONFIRMED' | 'LOCKED' | 'CLOSED';

export interface RegisteredUser {
  id: string;
  firstName: string;
  lastName: string | null;
  businessName: string;
  email: string;
  phone: string;
  registeredAt: string;
  status: RegisteredUserStatus;
}

export interface DirectoryStats {
  total: number;
  thisMonth: number;
  today: number;
}

export const directoryQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;

export interface DirectoryResult {
  users: RegisteredUser[];
  total: number;
  page: number;
  pageCount: number;
}

function buildWhere(search: string | undefined): Prisma.UserWhereInput {
  if (!search) return {};
  const term = search.trim();
  if (!term) return {};

  // Phone numbers are stored in E.164; match what the admin typed either way.
  const digits = term.replace(/[^\d]/g, '');

  return {
    OR: [
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term, mode: 'insensitive' } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } as Prisma.StringFilter }] : []),
      { memberships: { some: { business: { name: { contains: term, mode: 'insensitive' as const } } } } },
    ],
  };
}

function statusOf(user: { deletedAt: Date | null; lockedUntil: Date | null; emailVerifiedAt: Date | null }): RegisteredUserStatus {
  if (user.deletedAt) return 'CLOSED';
  if (user.lockedUntil && user.lockedUntil > new Date()) return 'LOCKED';
  if (!user.emailVerifiedAt) return 'UNCONFIRMED';
  return 'ACTIVE';
}

export async function listRegisteredUsers(query: DirectoryQuery): Promise<DirectoryResult> {
  const where = buildWhere(query.search);
  const skip = (query.page - 1) * query.pageSize;

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
      skip,
      take: query.pageSize,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        createdAt: true,
        deletedAt: true,
        lockedUntil: true,
        emailVerifiedAt: true,
        memberships: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { business: { select: { name: true } } },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: rows.map((row) => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      businessName: row.memberships[0]?.business.name ?? '—',
      email: row.email,
      phone: row.phone,
      registeredAt: row.createdAt.toISOString(),
      status: statusOf(row),
    })),
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getDirectoryStats(): Promise<DirectoryStats> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [total, thisMonth, today] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.user.count({ where: { createdAt: { gte: dayStart } } }),
  ]);

  return { total, thisMonth, today };
}
