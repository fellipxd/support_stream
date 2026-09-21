import { beforeEach, describe, expect, it } from 'vitest';
import { createTicket, getAttachments } from '@/server/tickets/service';
import { getDownloadableAttachment, uploadAttachment } from '@/server/attachments/service';
import { setStorage } from '@/server/attachments/storage';
import { guestActor, prisma, makeWorld, reportInput, resetDatabase, SYSTEM } from '../factories';

/** docs/SECURITY_MODEL.md T7 — the upload and download path end to end. */

let world: Awaited<ReturnType<typeof makeWorld>>;
const files = new Map<string, Buffer>();

const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(64, 1)]);

function fakeFile(name: string, type: string, data: Buffer): File {
  return new File([new Uint8Array(data)], name, { type });
}

beforeEach(async () => {
  await resetDatabase();
  world = await makeWorld();
  files.clear();
  setStorage({
    async put(key, data) {
      files.set(key, data);
    },
    async get(key) {
      const data = files.get(key);
      if (!data) throw new Error('missing');
      return data;
    },
    async delete(key) {
      files.delete(key);
    },
  });
});

describe('uploading', () => {
  it('stores a valid screenshot under a random key', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const attachment = await uploadAttachment(world.support, {
      ticketId: id,
      file: fakeFile('screenshot.png', 'image/png', PNG),
    });

    expect(attachment.filename).toBe('screenshot.png');
    expect(attachment.storageKey).not.toContain('screenshot');
    expect(files.has(attachment.storageKey)).toBe(true);
    expect(attachment.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records the upload on the ticket timeline', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    await uploadAttachment(world.support, {
      ticketId: id,
      file: fakeFile('evidence.png', 'image/png', PNG),
    });

    const activity = await prisma.ticketActivity.findFirstOrThrow({
      where: { ticketId: id, action: 'attachment.added' },
    });
    expect(activity.newValue).toBe('evidence.png');
  });

  it('queues a malware scan', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const attachment = await uploadAttachment(world.support, {
      ticketId: id,
      file: fakeFile('a.png', 'image/png', PNG),
    });

    expect(attachment.scanStatus).toBe('PENDING');
    const job = await prisma.job.findFirstOrThrow({ where: { type: 'attachment.scan' } });
    expect((job.payload as Record<string, unknown>).attachmentId).toBe(attachment.id);
  });

  it('rejects a disallowed type', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    await expect(
      uploadAttachment(world.support, {
        ticketId: id,
        file: fakeFile('payload.svg', 'image/svg+xml', Buffer.from('<svg/>')),
      }),
    ).rejects.toThrow(/Unsupported file type/i);
    expect(files.size).toBe(0);
  });

  it('rejects a file whose content does not match its claimed type', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const disguised = Buffer.concat([Buffer.from('<?php system($_GET[0]); ?>'), Buffer.alloc(32)]);
    await expect(
      uploadAttachment(world.support, {
        ticketId: id,
        file: fakeFile('shell.png', 'image/png', disguised),
      }),
    ).rejects.toThrow(/do not match|content/i);
  });

  it('forces a guest upload to be public, never internal', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const guest = await prisma.guestReporter.findFirstOrThrow();
    const attachment = await uploadAttachment(guestActor(id, guest.id), {
      ticketId: id,
      file: fakeFile('mine.png', 'image/png', PNG),
      visibility: 'INTERNAL',
    });
    expect(attachment.visibility).toBe('PUBLIC');
    expect(attachment.uploadedByGuest).toBe(true);
  });

  it('refuses an upload to a ticket the actor cannot see', async () => {
    const { id } = await createTicket(world.reporter, reportInput(world.portal.id));
    await expect(
      uploadAttachment(world.otherReporter, {
        ticketId: id,
        file: fakeFile('a.png', 'image/png', PNG),
      }),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });
});

describe('downloading', () => {
  it('serves a public attachment to the reporter', async () => {
    const { id } = await createTicket(world.reporter, reportInput(world.portal.id));
    const attachment = await uploadAttachment(world.support, {
      ticketId: id,
      file: fakeFile('a.png', 'image/png', PNG),
    });

    const result = await getDownloadableAttachment(world.reporter, attachment.id);
    expect(result.data.equals(PNG)).toBe(true);
  });

  it('hides an internal attachment from the reporter behind a not-found', async () => {
    const { id } = await createTicket(world.reporter, reportInput(world.portal.id));
    const attachment = await uploadAttachment(world.support, {
      ticketId: id,
      file: fakeFile('internal.png', 'image/png', PNG),
      visibility: 'INTERNAL',
    });

    await expect(getDownloadableAttachment(world.reporter, attachment.id)).rejects.toMatchObject({
      httpStatus: 404,
    });
    await expect(getDownloadableAttachment(world.support, attachment.id)).resolves.toBeTruthy();
  });

  it('refuses an attachment on someone else’s ticket', async () => {
    const { id } = await createTicket(world.reporter, reportInput(world.portal.id));
    const attachment = await uploadAttachment(world.support, {
      ticketId: id,
      file: fakeFile('a.png', 'image/png', PNG),
    });
    await expect(
      getDownloadableAttachment(world.otherReporter, attachment.id),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('blocks a file the scanner flagged', async () => {
    const { id } = await createTicket(SYSTEM, reportInput(world.portal.id));
    const attachment = await uploadAttachment(world.support, {
      ticketId: id,
      file: fakeFile('a.png', 'image/png', PNG),
    });
    await prisma.ticketAttachment.update({
      where: { id: attachment.id },
      data: { scanStatus: 'INFECTED' },
    });

    await expect(getDownloadableAttachment(world.support, attachment.id)).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('returns not-found for an attachment that does not exist', async () => {
    await expect(
      getDownloadableAttachment(world.support, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('keeps internal attachments out of the reporter’s listing', async () => {
    const { id } = await createTicket(world.reporter, reportInput(world.portal.id));
    await uploadAttachment(world.support, {
      ticketId: id,
      file: fakeFile('public.png', 'image/png', PNG),
    });
    await uploadAttachment(world.support, {
      ticketId: id,
      file: fakeFile('secret.png', 'image/png', PNG),
      visibility: 'INTERNAL',
    });

    expect((await getAttachments(world.reporter, id)).map((a) => a.filename)).toEqual([
      'public.png',
    ]);
    expect(await getAttachments(world.support, id)).toHaveLength(2);
  });
});
