const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const crypto     = require('crypto');
const { sql, poolPromise } = require('./db');

const app  = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// ── Utilidad: hash de contraseña ──────────────────────────
function hashPassword(pw) {
    return crypto.createHash('sha256').update(pw).digest('hex');
}

// ═══════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════

app.post('/api/registro', async (req, res) => {
    const { Nombre, correo, contrasena, nombre_display } = req.body;
    if (!Nombre || !correo || !contrasena)
        return res.status(400).json({ ok: false, mensaje: 'Faltan campos' });
    try {
        const pool = await poolPromise;
        const existe = await pool.request()
            .input('correo', sql.NVarChar, correo)
            .query('SELECT id FROM Usuarios WHERE correo = @correo');
        if (existe.recordset.length > 0)
            return res.status(409).json({ ok: false, mensaje: 'Correo ya registrado' });

        const hash = contrasena;
        await pool.request()
            .input('nombre',         sql.NVarChar, Nombre)
            .input('correo',         sql.NVarChar, correo)
            .input('contrasena',     sql.NVarChar, hash)
            .input('nombre_display', sql.NVarChar, nombre_display || Nombre.split(' ')[0])
            .query(`INSERT INTO Usuarios (Nombre, Correo, Contrasena, nombre_display)
                    VALUES (@nombre, @correo, @contrasena, @nombre_display)`);
        res.json({ ok: true, mensaje: 'Usuario registrado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, mensaje: 'Error interno' });
    }
});

app.post('/api/login', async (req, res) => {
    const { correo, contrasena } = req.body;
    if (!correo || !contrasena)
        return res.status(400).json({ ok: false, mensaje: 'Faltan campos' });
    try {
        const pool = await poolPromise;
        const hash = contrasena;
        const result = await pool.request()
            .input('correo',     sql.NVarChar, correo)
            .input('contrasena', sql.NVarChar, hash)
            .query(`SELECT id, Nombre, nombre_display
                    FROM Usuarios
                    WHERE Correo = @correo AND Contrasena = @contrasena`);
        if (result.recordset.length === 0)
            return res.status(401).json({ ok: false, mensaje: 'Credenciales incorrectas' });
        res.json({ ok: true, usuario: result.recordset[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, mensaje: 'Error interno' });
    }
});

// ═══════════════════════════════════════════════════════════
//  PRODUCTOS — stock real desde la BD
// ═══════════════════════════════════════════════════════════

app.get('/api/productos', async (req, res) => {
    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .query('SELECT id, nombre, categoria, precio, stock, img FROM Producto ORDER BY id');
        res.json({ ok: true, productos: result.recordset });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, mensaje: 'Error al obtener productos' });
    }
});

// ═══════════════════════════════════════════════════════════
//  VENTAS — confirmar pedido y restar stock
// ═══════════════════════════════════════════════════════════

app.post('/api/confirmar-pedido', async (req, res) => {
    const { usuario_nombre, cliente_nombre, telefono,
            tipo_entrega, direccion, referencia,
            subtotal, impuesto, total, items } = req.body;

    // Validaciones básicas
    if (!cliente_nombre || !tipo_entrega || !items || items.length === 0)
        return res.status(400).json({ ok: false, mensaje: 'Datos incompletos' });

    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();
        const req1 = new sql.Request(transaction);

        // 1. Verificar stock suficiente para todos los items
        for (const item of items) {
            const check = await new sql.Request(transaction)
                .input('id', sql.Int, item.id)
                .query('SELECT stock FROM Producto WHERE id = @id');

            if (check.recordset.length === 0)
                throw new Error(`Producto ID ${item.id} no existe`);

            const stockActual = check.recordset[0].stock;
            if (stockActual < item.qty)
                throw new Error(`Stock insuficiente para "${item.nombre}". Disponible: ${stockActual}`);
        }

        // 2. Insertar cabecera de venta
        const ventaResult = await new sql.Request(transaction)
            .input('usuario_nombre', sql.NVarChar, usuario_nombre || 'Sistema')
            .input('cliente_nombre', sql.NVarChar, cliente_nombre)
            .input('telefono',       sql.NVarChar, telefono || '')
            .input('tipo_entrega',   sql.NVarChar, tipo_entrega)
            .input('direccion',      sql.NVarChar, direccion  || '')
            .input('referencia',     sql.NVarChar, referencia || '')
            .input('subtotal',       sql.Decimal(10,2), subtotal)
            .input('impuesto',       sql.Decimal(10,2), impuesto)
            .input('total',          sql.Decimal(10,2), total)
            .query(`INSERT INTO Ventas
                        (usuario_nombre, cliente_nombre, telefono, tipo_entrega,
                         direccion, referencia, subtotal, impuesto, total)
                    OUTPUT INSERTED.id
                    VALUES
                        (@usuario_nombre, @cliente_nombre, @telefono, @tipo_entrega,
                         @direccion, @referencia, @subtotal, @impuesto, @total)`);

        const ventaId = ventaResult.recordset[0].id;

        // 3. Insertar detalle y restar stock por cada producto
        for (const item of items) {
            // Insertar línea de detalle
            await new sql.Request(transaction)
                .input('venta_id',    sql.Int,          ventaId)
                .input('producto_id', sql.Int,          item.id)
                .input('nombre',      sql.NVarChar,     item.nombre)
                .input('precio',      sql.Decimal(10,2),item.precio)
                .input('cantidad',    sql.Int,          item.qty)
                .input('subtotal',    sql.Decimal(10,2),item.precio * item.qty)
                .query(`INSERT INTO DetalleVenta
                            (venta_id, producto_id, nombre, precio, cantidad, subtotal)
                        VALUES
                            (@venta_id, @producto_id, @nombre, @precio, @cantidad, @subtotal)`);

            // Restar stock
            await new sql.Request(transaction)
                .input('qty', sql.Int, item.qty)
                .input('id',  sql.Int, item.id)
                .query('UPDATE Producto SET stock = stock - @qty WHERE id = @id');
        }

        await transaction.commit();
        console.log(`✅ Venta #${ventaId} confirmada — Total: $${total}`);
        res.json({ ok: true, venta_id: ventaId, mensaje: `Pedido #${ventaId} registrado` });

    } catch (err) {
        await transaction.rollback();
        console.error('❌ Error en pedido:', err.message);
        res.status(500).json({ ok: false, mensaje: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  ARRANQUE
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}\n`);
});

// ═══════════════════════════════════════════════════════════
//  ADMIN — Gestión de productos
// ═══════════════════════════════════════════════════════════
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// Guardar imágenes en la carpeta img/
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './img/'),
  filename:    (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Actualizar producto completo (stock, precio, categoría)
app.post('/api/admin/stock', async (req, res) => {
  const { id, stock, precio, categoria } = req.body;
  if (!id) return res.status(400).json({ ok: false, mensaje: 'Faltan datos' });
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id',        sql.Int,           id)
      .input('stock',     sql.Int,           parseInt(stock))
      .input('precio',    sql.Decimal(10,2), parseFloat(precio))
      .input('categoria', sql.NVarChar,      categoria)
      .query('UPDATE Producto SET stock = @stock, precio = @precio, categoria = @categoria WHERE id = @id');
    res.json({ ok: true, mensaje: 'Producto actualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

// Agregar nuevo producto con imagen
app.post('/api/admin/producto', upload.single('imagen'), async (req, res) => {
  const { nombre, categoria, precio, stock } = req.body;
  const img = req.file ? req.file.filename : null;
  if (!nombre || !categoria || !precio || !stock)
    return res.status(400).json({ ok: false, mensaje: 'Faltan campos' });
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('nombre',    sql.NVarChar,     nombre)
      .input('categoria', sql.NVarChar,     categoria)
      .input('precio',    sql.Decimal(10,2),parseFloat(precio))
      .input('stock',     sql.Int,          parseInt(stock))
      .input('img', sql.NVarChar, img || '')
      .query(`
        DECLARE @nuevoId INT;
        SELECT @nuevoId = ISNULL(MAX(id), 0) + 1 FROM Producto;
        INSERT INTO Producto (id, nombre, categoria, precio, stock, img)
        VALUES (@nuevoId, @nombre, @categoria, @precio, @stock, @img);
      `);
    res.json({ ok: true, mensaje: 'Producto agregado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

// Eliminar producto
app.delete('/api/admin/producto/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Producto WHERE id = @id');
    res.json({ ok: true, mensaje: 'Producto eliminado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

// Obtener categorías únicas
app.get('/api/categorias', async (req, res) => {
  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .query('SELECT DISTINCT categoria FROM Producto ORDER BY categoria');
    res.json({ ok: true, categorias: result.recordset.map(r => r.categoria) });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});