/**
 * Seed data: the organisation, its portals, categories, teams, SLA policies, routing rules and
 * one user per role. E2E tests run against exactly this data.
 */
import { PrismaClient, type RoleName, type Severity, type TeamKind } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = 'Passw0rd!demo';

const PORTALS = [
  { name: 'Customer Portal', slug: 'customer-portal', description: 'Self-service portal for retail customers', url: 'https://customer.example.com', prefix: 'CUS' },
  { name: 'Business Portal', slug: 'business-portal', description: 'Portal for corporate clients', url: 'https://business.example.com', prefix: 'BUS' },
  { name: 'Admin Portal', slug: 'admin-portal', description: 'Internal administration console', url: 'https://admin.example.com', prefix: 'ADM' },
  { name: 'Payment Portal', slug: 'payment-portal', description: 'Payments, settlement and reconciliation', url: 'https://pay.example.com', prefix: 'PAY' },
  { name: 'School Portal', slug: 'school-portal', description: 'School administration and records', url: 'https://school.example.com', prefix: 'SCH' },
  { name: 'Guardian Portal', slug: 'guardian-portal', description: 'Portal for parents and guardians', url: 'https://guardian.example.com', prefix: 'GRD' },
];

const CATEGORIES: Record<string, string[]> = {
  'customer-portal': ['Login & Access', 'Account', 'Payment', 'Performance', 'Data Accuracy', 'Other'],
  'business-portal': ['Login & Access', 'Reporting', 'Settlement', 'Integration', 'Other'],
  'admin-portal': ['Login & Access', 'Permissions', 'Configuration', 'Other'],
  'payment-portal': ['Payment', 'Settlement', 'Refunds', 'Reconciliation', 'Other'],
  'school-portal': ['Login & Access', 'Results', 'Enrolment', 'Guardian Payments', 'Other'],
  'guardian-portal': ['Login & Access', 'Payment', 'Ward Records', 'Notifications', 'Other'],
};

const SLA_POLICIES: Array<{ name: string; severity: Severity; firstResponseMins: number; resolutionMins: number; businessHoursOnly: boolean }> = [
  { name: 'Standard', severity: 'S1_CRITICAL', firstResponseMins: 15, resolutionMins: 240, businessHoursOnly: false },
  { name: 'Standard', severity: 'S2_HIGH', firstResponseMins: 60, resolutionMins: 480, businessHoursOnly: true },
  { name: 'Standard', severity: 'S3_MEDIUM', firstResponseMins: 240, resolutionMins: 1440, businessHoursOnly: true },
  { name: 'Standard', severity: 'S4_LOW', firstResponseMins: 480, resolutionMins: 4320, businessHoursOnly: true },
];

const PEOPLE: Array<{ name: string; email: string; roles: RoleName[]; team?: TeamKind }> = [
  { name: 'Ada Support', email: 'support@example.com', roles: ['USER', 'SUPPORT_AGENT'], team: 'SUPPORT' },
  { name: 'Jane Triage', email: 'jane@example.com', roles: ['USER', 'SUPPORT_AGENT'], team: 'SUPPORT' },
  { name: 'Sam Lead', email: 'support.lead@example.com', roles: ['USER', 'SUPPORT_AGENT', 'SUPPORT_LEAD'], team: 'SUPPORT' },
  { name: 'Qadri Quality', email: 'qa@example.com', roles: ['USER', 'QA'], team: 'QA' },
  { name: 'Uche QA Lead', email: 'qa.lead@example.com', roles: ['USER', 'QA', 'QA_LEAD'], team: 'QA' },
  { name: 'Michael Dev', email: 'dev@example.com', roles: ['USER', 'DEVELOPER'], team: 'ENGINEERING' },
  { name: 'Dora Dev', email: 'dev2@example.com', roles: ['USER', 'DEVELOPER'], team: 'ENGINEERING' },
  { name: 'Helen HOD', email: 'hod@example.com', roles: ['USER', 'HOD'] },
  { name: 'Ada Admin', email: 'admin@example.com', roles: ['USER', 'ADMIN'] },
  { name: 'Root Super', email: 'superadmin@example.com', roles: ['USER', 'SUPER_ADMIN'] },
  { name: 'Regular Reporter', email: 'user@example.com', roles: ['USER'] },
  { name: 'Second Reporter', email: 'user2@example.com', roles: ['USER'] },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const org = await prisma.organization.upsert({
    where: { slug: 'acme' },
    update: {},
    create: { name: 'Acme Group', slug: 'acme', timezone: 'Africa/Lagos' },
  });

  // SLA policies -----------------------------------------------------------
  for (const policy of SLA_POLICIES) {
    await prisma.slaPolicy.upsert({
      where: { name_severity: { name: policy.name, severity: policy.severity } },
      update: policy,
      create: policy,
    });
  }

  // Portals, projects, categories -----------------------------------------
  for (const [index, def] of PORTALS.entries()) {
    const portal = await prisma.portal.upsert({
      where: { slug: def.slug },
      update: { name: def.name, description: def.description, url: def.url },
      create: {
        organizationId: org.id,
        name: def.name,
        slug: def.slug,
        description: def.description,
        url: def.url,
        sortOrder: index,
      },
    });

    const project = await prisma.project.upsert({
      where: { slug: `${def.slug}-project` },
      update: {},
      create: {
        portalId: portal.id,
        name: `${def.name} Product`,
        slug: `${def.slug}-project`,
        keyPrefix: def.prefix,
        isDefault: true,
      },
    });

    for (const [order, name] of (CATEGORIES[def.slug] ?? []).entries()) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await prisma.ticketCategory.upsert({
        where: { portalId_slug: { portalId: portal.id, slug } },
        update: { name, sortOrder: order },
        create: { portalId: portal.id, name, slug, sortOrder: order },
      });
    }

    for (const kind of ['SUPPORT', 'QA', 'ENGINEERING'] as TeamKind[]) {
      await prisma.team.upsert({
        where: { slug: `${def.slug}-${kind.toLowerCase()}` },
        update: {},
        create: {
          projectId: project.id,
          name: `${def.name} ${kind.charAt(0)}${kind.slice(1).toLowerCase()}`,
          slug: `${def.slug}-${kind.toLowerCase()}`,
          kind,
        },
      });
    }
  }

  // People ------------------------------------------------------------------
  for (const person of PEOPLE) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: { name: person.name },
      create: {
        organizationId: org.id,
        email: person.email,
        name: person.name,
        passwordHash,
      },
    });
    for (const role of person.roles) {
      await prisma.userRole.upsert({
        where: { userId_role: { userId: user.id, role } },
        update: {},
        create: { userId: user.id, role },
      });
    }
    if (person.team) {
      const teams = await prisma.team.findMany({ where: { kind: person.team } });
      for (const team of teams) {
        await prisma.teamMember.upsert({
          where: { teamId_userId: { teamId: team.id, userId: user.id } },
          update: {},
          create: { teamId: team.id, userId: user.id },
        });
      }
    }
  }

  // Routing rules: portal-level defaults plus two worked examples from the brief -----
  const portals = await prisma.portal.findMany({ include: { projects: true, categories: true } });
  for (const portal of portals) {
    const project = portal.projects[0];
    if (!project) continue;
    const [support, qa, eng] = await Promise.all([
      prisma.team.findUnique({ where: { slug: `${portal.slug}-support` } }),
      prisma.team.findUnique({ where: { slug: `${portal.slug}-qa` } }),
      prisma.team.findUnique({ where: { slug: `${portal.slug}-engineering` } }),
    ]);

    const existing = await prisma.routingRule.findFirst({ where: { portalId: portal.id, categoryId: null } });
    if (!existing) {
      await prisma.routingRule.create({
        data: {
          name: `${portal.name} default`,
          portalId: portal.id,
          projectId: project.id,
          supportTeamId: support?.id,
          qaTeamId: qa?.id,
          engineeringTeamId: eng?.id,
        },
      });
    }

    // Payment Portal + Settlement, and School Portal + Guardian Payments.
    const specialCategory =
      portal.slug === 'payment-portal'
        ? portal.categories.find((c) => c.slug === 'settlement')
        : portal.slug === 'school-portal'
          ? portal.categories.find((c) => c.slug === 'guardian-payments')
          : null;

    if (specialCategory) {
      const already = await prisma.routingRule.findFirst({ where: { categoryId: specialCategory.id } });
      if (!already) {
        await prisma.routingRule.create({
          data: {
            name: `${portal.name} — ${specialCategory.name}`,
            portalId: portal.id,
            categoryId: specialCategory.id,
            projectId: project.id,
            supportTeamId: support?.id,
            qaTeamId: qa?.id,
            engineeringTeamId: eng?.id,
          },
        });
      }
    }
  }

  // Attach the standard SLA policy to every portal.
  const standard = await prisma.slaPolicy.findFirst({ where: { name: 'Standard', severity: 'S3_MEDIUM' } });
  if (standard) {
    await prisma.portal.updateMany({ where: { slaPolicyId: null }, data: { slaPolicyId: standard.id } });
  }

  console.log(`Seeded ${PORTALS.length} portals and ${PEOPLE.length} users.`);
  console.log(`Sign in with any seeded email (e.g. admin@example.com) and password: ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
