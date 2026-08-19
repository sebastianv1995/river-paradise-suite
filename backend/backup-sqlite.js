const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const source = path.resolve(process.argv[2] || '');
const target = path.resolve(process.argv[3] || '');
if (!process.argv[2] || !process.argv[3] || source === target) {
  console.error('Uso: node backup-sqlite.js ORIGEN DESTINO');
  process.exit(1);
}

const db = new DatabaseSync(source, { readOnly:true });
try {
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
} finally {
  db.close();
}
