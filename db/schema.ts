import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const emailMessages = sqliteTable("email_messages", {
  messageId: text("message_id").primaryKey(),
  threadId: text("thread_id"),
  folderId: text("folder_id"),
  subject: text("subject").notNull().default("（无主题）"),
  senderName: text("sender_name"),
  senderEmail: text("sender_email"),
  recipientsJson: text("recipients_json").notNull().default("[]"),
  sentAt: integer("sent_at"),
  snippet: text("snippet"),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  labelsJson: text("labels_json").notNull().default("[]"),
  direction: text("direction").notNull().default("unknown"),
  rawJson: text("raw_json"),
  importedAt: integer("imported_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const mailSyncState = sqliteTable("mail_sync_state", {
  mailboxId: text("mailbox_id").primaryKey(),
  pageToken: text("page_token"),
  totalImported: integer("total_imported").notNull().default(0),
  lastSyncedAt: integer("last_synced_at"),
  status: text("status").notNull().default("idle"),
  lastError: text("last_error"),
});
