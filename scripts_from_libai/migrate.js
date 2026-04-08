/**
 * 数据库迁移脚本
 * 创建所有必要的表结构
 */

const { Client } = require('pg');

const dbUrl = process.env.DATABASE_URL || 'postgresql://libai:libai_password@localhost:5432/libai_trading';
const client = new Client({ connectionString: dbUrl });

async function runMigrations() {
  try {
    console.log('开始数据库迁移...');
    await client.connect();

    // 测试连接
    const result = await client.query('SELECT 1');
    if (result.rows[0].select1 === 1) {
      console.log('✅ 数据库连接成功');
    }

    // 检查表是否存在
    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('users', 'subscriptions', 'trades')
    `);

    const existingTables = tableCheck.rows.map(r => r.table_name);
    console.log(`✅ 已存在表: ${existingTables.join(', ')}`);

    console.log('✅ 数据库迁移完成 (表已由 init-database.sql 创建)');
    process.exit(0);
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
