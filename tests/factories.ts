import { PrismaClient, type RoleName, type Severity } from '@prisma/client';
import type { Actor } from '@/server/authz/actor';

export const prisma = new PrismaClient();

/** Truncates every table between tests so each one starts from a known state. */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function makeOrganization(slug = 'test-org') {
  return prisma.organization.create({ data: { name: 'Test Org', slug } });
}

export async function makeUser(
  organizationId: string,
  options: { email?: string; name?: string; roles?: RoleName[] } = {},
): Promise<Extract<Actor, { kind: 'user' }>> {
  const email = options.email ?? `user-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const roles = options.roles ?? ['USER'];
  const user = await prisma.user.create({
    data: {
      organizationId,
      email,
      name: options.name ?? 'Test Person',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
      roles: { create: roles.map((role) => ({ role })) },
    },
  });
  return { kind: 'user', id: user.id, name: user.name, email: user.email, roles, organizationId };
}

export async function makePortal(organizationId: string, slug = 'test-portal') {
  const portal = await prisma.portal.create({
    data: { organizationId, name: 'Test Portal', slug },
  });
  const project = await prisma.project.create({
    data: {
      portalId: portal.id,
      name: 'Test Project',
      slug: `${slug}-project`,
      keyPrefix: 'SUP',
      isDefault: true,
    },
  });
  const category = await prisma.ticketCategory.create({
    data: { portalId: portal.id, name: 'Payment', slug: 'payment' },
  });
  return { portal, project, category };
}

export async function makeSlaPolicy(severity: Severity = 'S3_MEDIUM') {
  return prisma.slaPolicy.create({
    data: {
      name: `Test ${severity}`,
      severity,
      firstResponseMins: 60,
      resolutionMins: 480,
      businessHoursOnly: false,
    },
  });
}

/** A complete fixture: organisation, portal, SLA and one user per working role. */
export async function makeWorld() {
  const org = await makeOrganization(`org-${Math.random().toString(36).slice(2, 8)}`);
  const { portal, project, category } = await makePortal(
    org.id,
    `portal-${Math.random().toString(36).slice(2, 8)}`,
  );
  await makeSlaPolicy('S3_MEDIUM');
  await makeSlaPolicy('S2_HIGH');

  const [reporter, otherReporter, support, qa, developer, admin] = await Promise.all([
    makeUser(org.id, { name: 'Reporter One', roles: ['USER'] }),
    makeUser(org.id, { name: 'Reporter Two', roles: ['USER'] }),
    makeUser(org.id, { name: 'Support Agent', roles: ['USER', 'SUPPORT_AGENT'] }),
    makeUser(org.id, { name: 'QA Person', roles: ['USER', 'QA'] }),
    makeUser(org.id, { name: 'Developer Person', roles: ['USER', 'DEVELOPER'] }),
    makeUser(org.id, { name: 'Admin Person', roles: ['USER', 'ADMIN'] }),
  ]);

  return { org, portal, project, category, reporter, otherReporter, support, qa, developer, admin };
}

export const SYSTEM: Actor = { kind: 'system' };

export function guestActor(ticketId: string, guestReporterId: string): Actor {
  return { kind: 'guest', ticketId, guestReporterId, name: 'Guest', email: 'guest@example.com' };
}

export function reportInput(portalId: string, overrides: Record<string, unknown> = {}) {
  return {
    portalId,
    title: 'I cannot make payment for my ward',
    description: 'Every time I click pay, the page shows an error and nothing happens.',
    reporterName: 'Guest Reporter',
    reporterEmail: 'guest@example.com',
    ...overrides,
  } as never;
}
