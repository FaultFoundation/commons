import tls from "node:tls";

/**
 * Minimal SMTP submission client — enough to send one plain-text message.
 *
 * Built on `node:tls` (via the nodejs_compat flag) rather than a library on
 * `cloudflare:sockets`: OpenNext bundles the server with esbuild, which can't
 * resolve the `cloudflare:` scheme and has no hook for marking it external, so
 * anything importing it fails the build. `node:tls` is a plain builtin that
 * bundles cleanly and is backed by the same workerd socket implementation.
 *
 * Implicit TLS only (port 465). Workers block outbound port 25; 465 is open
 * and avoids the plaintext-then-STARTTLS upgrade entirely.
 */

export type SmtpMessage = {
  host: string;
  port: number;
  username: string;
  password: string;
  /** May be "Name <addr@host>"; only the address goes in the envelope. */
  from: string;
  to: string;
  subject: string;
  text: string;
};

const TIMEOUT_MS = 20_000;

export async function sendSmtpMail(msg: SmtpMessage): Promise<void> {
  const socket = tls.connect({ host: msg.host, port: msg.port, servername: msg.host });
  socket.setEncoding("utf8");

  const read = createReader(socket);
  const write = (line: string) =>
    new Promise<void>((resolve, reject) => {
      socket.write(`${line}\r\n`, (err) => (err ? reject(err) : resolve()));
    });

  const say = async (line: string, expected: number[], what: string) => {
    await write(line);
    return expect(await read(), expected, what);
  };

  const conversation = async () => {
    expect(await read(), [220], "greeting");
    await say(`EHLO ${hostOf(msg.from)}`, [250], "EHLO");

    // AUTH PLAIN: one round trip, and Gmail app passwords accept it.
    const token = btoa(`\0${msg.username}\0${msg.password}`);
    await say(`AUTH PLAIN ${token}`, [235], "authentication");

    await say(`MAIL FROM:<${addressOf(msg.from)}>`, [250], "MAIL FROM");
    await say(`RCPT TO:<${addressOf(msg.to)}>`, [250, 251], "RCPT TO");
    await say("DATA", [354], "DATA");

    await write(`${buildMessage(msg)}\r\n.`);
    expect(await read(), [250], "message body");

    // A refused QUIT doesn't unsend the mail, so failures here are ignored.
    await write("QUIT").catch(() => {});
  };

  try {
    await withTimeout(conversation(), TIMEOUT_MS);
  } finally {
    socket.destroy();
  }
}

// ---------------------------------------------------------------------------
// Wire helpers
// ---------------------------------------------------------------------------

/**
 * Resolves one complete SMTP reply per call. Replies may span several lines —
 * continuations are `250-text`, the last line is `250 text` — so a reply is
 * only complete once a space-separated code arrives.
 */
function createReader(socket: tls.TLSSocket): () => Promise<string> {
  const COMPLETE = /^(?:\d{3}-[^\r\n]*\r\n)*\d{3} [^\r\n]*\r\n/;

  let buffer = "";
  let failure: Error | null = null;
  let closed = false;
  let pending: {
    resolve: (reply: string) => void;
    reject: (error: Error) => void;
  } | null = null;

  const flush = () => {
    if (!pending) return;
    const match = buffer.match(COMPLETE);
    if (match) {
      buffer = buffer.slice(match[0].length);
      const waiter = pending;
      pending = null;
      waiter.resolve(match[0]);
      return;
    }
    if (failure || closed) {
      const waiter = pending;
      pending = null;
      waiter.reject(failure ?? new Error("SMTP connection closed unexpectedly"));
    }
  };

  socket.on("data", (chunk: string) => {
    buffer += chunk;
    flush();
  });
  socket.on("error", (error: Error) => {
    failure = error;
    flush();
  });
  socket.on("close", () => {
    closed = true;
    flush();
  });

  return () =>
    new Promise<string>((resolve, reject) => {
      pending = { resolve, reject };
      flush();
    });
}

function expect(reply: string, codes: number[], what: string): string {
  const code = Number(reply.slice(0, 3));
  if (!codes.includes(code)) {
    throw new Error(`SMTP ${what} failed: ${reply.trim()}`);
  }
  return reply;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`SMTP timed out after ${ms}ms`)), ms),
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Message construction
// ---------------------------------------------------------------------------

/** Bare address out of `Name <addr@host>` (or an already-bare address). */
function addressOf(input: string): string {
  const angled = input.match(/<([^>]+)>/);
  return (angled ? angled[1] : input).trim();
}

function hostOf(from: string): string {
  return addressOf(from).split("@")[1] ?? "localhost";
}

/** RFC 2047 for non-ASCII headers; plain ASCII passes through untouched. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(value)) return value;
  const bytes = new TextEncoder().encode(value);
  return `=?UTF-8?B?${btoa(String.fromCharCode(...bytes))}?=`;
}

function buildMessage(msg: SmtpMessage): string {
  const headers = [
    `From: ${encodeHeader(msg.from)}`,
    `To: ${addressOf(msg.to)}`,
    `Subject: ${encodeHeader(msg.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${hostOf(msg.from)}>`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
  ];

  // Dot-stuffing: a body line of "." alone would otherwise end the DATA block.
  const body = msg.text
    .split(/\r?\n/)
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");

  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}
