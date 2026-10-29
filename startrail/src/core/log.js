const SECRET_RE = /Bearer\s+[A-Za-z0-9\-._~+/]+=*|sk-[A-Za-z0-9_\-]{8,}|api[_-]?key["'\s:=]+[A-Za-z0-9_\-]{6,}/gi;

export function redact(value, secrets = []) {
  let text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  for (const secret of secrets) {
    if (secret && String(secret).length > 3) text = text.split(String(secret)).join('[redacted]');
  }
  return text.replace(SECRET_RE, '[redacted]');
}

export function createLogger({ sink, secrets = [] } = {}) {
  const entries = [];
  function write(entry) {
    const row = {
      ts: new Date().toISOString(),
      level: entry.level || 'info',
      taskId: entry.taskId || null,
      event: entry.event,
      adapter: entry.adapter || null,
      msg: redact(entry.msg || '', secrets),
      data: entry.data ? JSON.parse(redact(entry.data, secrets)) : undefined,
    };
    entries.push(row);
    if (sink) sink(row);
    return row;
  }
  return { write, entries };
}
