require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'oes_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
    };

const pool = new Pool(poolConfig);

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running migrations...');
    
    const schemaSQL = fs.readFileSync(path.join(__dirname, '001_schema.sql'), 'utf8');
    await client.query(schemaSQL);
    console.log('✅ Schema created');

    const seedSQL = fs.readFileSync(path.join(__dirname, '002_seed.sql'), 'utf8');
    await client.query(seedSQL);
    console.log('✅ Seed data inserted');

    // Create admin with proper bcrypt hash
    const bcrypt = require('bcryptjs');
    const adminPass = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@1234', 12);
    const examinerPass = await bcrypt.hash('Examiner@1234', 12);
    const studentPass = await bcrypt.hash('Student@1234', 12);

    await client.query(`UPDATE users SET password_hash = $1 WHERE email = 'admin@oes.edu'`, [adminPass]);
    await client.query(`UPDATE users SET password_hash = $1 WHERE email = 'examiner@oes.edu'`, [examinerPass]);
    await client.query(`UPDATE users SET password_hash = $1 WHERE email IN ('alice@student.edu','bob@student.edu','carol@student.edu')`, [studentPass]);

    console.log('✅ Passwords hashed correctly');
    console.log('\n🎉 Migration complete!');
    console.log('\n📋 Default Credentials:');
    console.log('  Admin:    admin@oes.edu     / Admin@1234');
    console.log('  Examiner: examiner@oes.edu  / Examiner@1234');
    console.log('  Student:  alice@student.edu / Student@1234');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(console.error);
