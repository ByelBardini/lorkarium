import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { runInTransaction } from '../../src/database/transaction';
import { FeedbackAttachmentsDao } from '../../src/modules/feedback/feedback-attachments.dao';
import type { NewFeedbackEntryPo } from '../../src/modules/feedback/feedback-entries.po';
import { FeedbackDao } from '../../src/modules/feedback/feedback.dao';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

function bugOf(senderId: string, steps = 'Abri a mesa'): NewFeedbackEntryPo {
  return {
    senderId,
    senderUsername: 'bia',
    kind: 'bug',
    steps,
    expected: 'O token andar',
    actual: 'O token voltou',
    platform: 'browser',
    appVersion: 'Chrome 142',
  };
}

let shotNumber = 0;

async function looseShotOf(uploaderId: string): Promise<string> {
  shotNumber += 1;
  const id = `00000000-0000-4000-8000-${String(shotNumber).padStart(12, '0')}`;
  await new FeedbackAttachmentsDao(live.connection.db).insert({
    id,
    uploadedBy: uploaderId,
    storageKey: `feedback/${id}`,
    mimeType: 'image/webp',
    sizeBytes: 10,
    width: 4,
    height: 4,
  });
  return id;
}

describe('the feedback tables against Postgres', () => {
  it('an entry is kept with its sections, platform, version and @, oldest first with the total', async () => {
    const dao = new FeedbackDao(live.connection.db);
    const first = await dao.insert(bugOf(live.bia.id, 'Primeiro'));
    const second = await dao.insert(bugOf(live.caio.id, 'Segundo'));

    const page = await dao.pageOf({ limit: 1, offset: 0 });

    expect(page.total).toBe(2);
    expect(page.rows.map((row) => row.id)).toEqual([first]);
    expect(page.rows[0]).toMatchObject({
      steps: 'Primeiro',
      platform: 'browser',
      senderUsername: 'bia',
    });
    expect((await dao.pageOf({ limit: 5, offset: 1 })).rows.map((row) => row.id)).toEqual([second]);
  });

  it('a bug carrying a suggestion section is refused by the database', async () => {
    const dao = new FeedbackDao(live.connection.db);

    await expect(dao.insert({ ...bugOf(live.bia.id), idea: 'misturado' })).rejects.toThrow();
  });

  it('the sender is read with the suspension and counts only their own waiting entries', async () => {
    const dao = new FeedbackDao(live.connection.db);
    await dao.insert(bugOf(live.bia.id));
    await dao.insert(bugOf(live.bia.id));
    await dao.insert(bugOf(live.caio.id));
    await live.connection.db.execute(
      sql`UPDATE users SET suspended_at = now() WHERE id = ${live.caio.id}`,
    );

    const sender = await runInTransaction(live.connection.db, (tx) =>
      new FeedbackDao(tx).lockSender(live.caio.id),
    );

    expect(sender).toEqual({ username: 'caio', suspended: true });
    expect(await dao.waitingCountOf(live.bia.id)).toBe(2);
  });

  it('only the loose screenshots of the uploader are locked, and the claim ties them to the entry', async () => {
    const mine = await looseShotOf(live.bia.id);
    const theirs = await looseShotOf(live.caio.id);
    const entryId = await new FeedbackDao(live.connection.db).insert(bugOf(live.bia.id));

    await runInTransaction(live.connection.db, async (tx) => {
      const attachments = new FeedbackAttachmentsDao(tx);
      expect(await attachments.lockLooseOf(live.bia.id, [mine, theirs])).toEqual([mine]);
      await attachments.claim(entryId, [mine]);
    });

    const attachments = new FeedbackAttachmentsDao(live.connection.db);
    expect((await attachments.listOf([entryId])).map((row) => row.id)).toEqual([mine]);
    expect(await attachments.findInEntry(entryId, theirs)).toBeUndefined();
    expect(await attachments.lockLooseOf(live.bia.id, [mine])).toEqual([]);
    expect(await attachments.storageKeysOf(entryId)).toEqual([`feedback/${mine}`]);
  });

  it('deleting the entry takes its screenshots; deleting the account takes the rest', async () => {
    const dao = new FeedbackDao(live.connection.db);
    const claimed = await looseShotOf(live.bia.id);
    const loose = await looseShotOf(live.bia.id);
    const entryId = await dao.insert(bugOf(live.bia.id));
    const other = await dao.insert(bugOf(live.bia.id));
    await new FeedbackAttachmentsDao(live.connection.db).claim(entryId, [claimed]);
    expect(
      await new FeedbackAttachmentsDao(live.connection.db).storageKeysOfUploader(live.bia.id),
    ).toHaveLength(2);

    await dao.deleteById(entryId);
    expect(await idsOf('feedback_attachments')).toEqual([loose]);

    await live.connection.db.execute(sql`DELETE FROM users WHERE id = ${live.bia.id}`);
    expect(await idsOf('feedback_attachments')).toEqual([]);
    expect(await idsOf('feedback_entries')).not.toContain(other);
  });

  it('a locked entry another transaction already deleted is undefined', async () => {
    const dao = new FeedbackDao(live.connection.db);
    const entryId = await dao.insert(bugOf(live.bia.id));
    await dao.deleteById(entryId);

    expect(await dao.lockById(entryId)).toBeUndefined();
  });

  it('only loose screenshots older than the cut leave, with their keys', async () => {
    const old = await looseShotOf(live.bia.id);
    const fresh = await looseShotOf(live.bia.id);
    await live.connection.db.execute(
      sql`UPDATE feedback_attachments SET created_at = now() - interval '25 hours' WHERE id = ${old}`,
    );
    const cut = new Date(Date.now() - 24 * 3600 * 1000);

    const keys = await new FeedbackAttachmentsDao(live.connection.db).deleteLooseBefore(cut, 500);

    expect(keys).toEqual([`feedback/${old}`]);
    expect(await idsOf('feedback_attachments')).toEqual([fresh]);
  });
});

async function idsOf(table: 'feedback_entries' | 'feedback_attachments'): Promise<string[]> {
  const found = await live.connection.db.execute(sql`SELECT id FROM ${sql.identifier(table)}`);
  return found.rows.map((row) => (row as { id: string }).id);
}
