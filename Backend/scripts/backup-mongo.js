/**
 * Type-faithful backup of a MongoDB database to newline-delimited EJSON.
 *
 *   URI=<mongodb uri> OUT=/root/backups/maava-2026-08-15 node scripts/backup-mongo.js
 *   URI=... OUT=... node scripts/backup-mongo.js --verify     # re-read and check
 *
 * EJSON rather than plain JSON because plain JSON silently destroys a Mongo
 * backup: ObjectIds become strings and Dates become strings, so a restore
 * produces documents that no longer match any query or index. EJSON round-trips
 * both exactly.
 *
 * Newline-delimited rather than one big array so a large collection streams
 * instead of being assembled in memory, and so a truncated file loses only its
 * last record rather than parsing as nothing.
 *
 * READ ONLY against the database. Writes only to OUT.
 *
 * Restore with scripts/restore-mongo.js, or by reading each .jsonl line through
 * EJSON.parse and inserting it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { EJSON } from 'bson';

const URI = process.env.URI;
const OUT = process.env.OUT;
const verify = process.argv.includes('--verify');

const run = async () => {
    if (!URI) throw new Error('URI must be set');
    if (!OUT) throw new Error('OUT must be set (a directory path)');

    const client = new MongoClient(URI, { serverSelectionTimeoutMS: 20000 });
    await client.connect();
    const db = client.db();

    fs.mkdirSync(OUT, { recursive: true });
    console.log(`database : ${db.databaseName}`);
    console.log(`output   : ${OUT}\n`);

    const collections = (await db.listCollections().toArray())
        .map((c) => c.name)
        .filter((n) => !n.startsWith('system.'))
        .sort();

    const manifest = { database: db.databaseName, takenAt: new Date().toISOString(), collections: {} };
    let grandTotal = 0;

    for (const name of collections) {
        const file = path.join(OUT, `${name}.jsonl`);
        const stream = fs.createWriteStream(file, { flags: 'w' });
        const hash = createHash('sha256');
        let count = 0;

        const cursor = db.collection(name).find({}, { noCursorTimeout: false });
        for await (const doc of cursor) {
            const line = `${EJSON.stringify(doc, { relaxed: false })}\n`;
            hash.update(line);
            if (!stream.write(line)) await new Promise((r) => stream.once('drain', r));
            count += 1;
        }
        await new Promise((r) => stream.end(r));

        const bytes = fs.statSync(file).size;
        manifest.collections[name] = { count, bytes, sha256: hash.digest('hex') };
        grandTotal += count;
        if (count > 0) {
            console.log(`  ${name.padEnd(34)} ${String(count).padStart(7)} docs  ${(bytes / 1024).toFixed(0).padStart(7)} KB`);
        }
    }

    manifest.totalDocuments = grandTotal;
    fs.writeFileSync(path.join(OUT, '_manifest.json'), JSON.stringify(manifest, null, 2));

    console.log(`\n  ${collections.length} collections, ${grandTotal} documents`);
    console.log(`  manifest: ${path.join(OUT, '_manifest.json')}`);

    if (verify) {
        console.log('\n=== verify: re-reading every file and comparing to the live counts ===\n');
        let bad = 0;
        for (const [name, meta] of Object.entries(manifest.collections)) {
            const file = path.join(OUT, `${name}.jsonl`);
            const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
            // Parsing every line proves the file is not just present but readable
            // as EJSON -- a backup that cannot be parsed is not a backup.
            let parsed = 0;
            for (const l of lines) { EJSON.parse(l); parsed += 1; }
            const live = await db.collection(name).countDocuments();
            const ok = parsed === meta.count && parsed === live;
            if (!ok) { bad += 1; console.log(`  MISMATCH ${name}: file ${parsed}, manifest ${meta.count}, live ${live}`); }
        }
        console.log(bad === 0
            ? `  all ${Object.keys(manifest.collections).length} collections verified: every line parses and counts match live`
            : `  ${bad} collection(s) FAILED verification`);
        await client.close();
        return bad === 0 ? 0 : 1;
    }

    await client.close();
    return 0;
};

run().then((c) => process.exit(c)).catch((e) => { console.error(`backup failed: ${e.message}`); process.exit(1); });
