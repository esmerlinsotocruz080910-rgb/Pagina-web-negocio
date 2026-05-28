const sql = require('mssql/msnodesqlv8');

const config = {
    server: "localhost\\SQLEXPRESS",
    database: "Colmado Ocoa",
    options: {
        trustedConnection: true,
        trustServerCertificate: true,
        encrypt: false
    }
};

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('✅ Conectado a SQL Server');
        return pool;
    })
    .catch(err => {
        console.error('❌ Error:', err.message);
        process.exit(1);
    });

module.exports = { sql, poolPromise };