/* ============================================================
   registro.js — Colmado Ocoa
   Lógica completa de la página de registro
   ============================================================ */

// ── Validación en tiempo real ──────────────────────────────

function validarNombre() {
  const val = document.getElementById('nombre').value.trim();
  setReq('req-nombre-len',   val.length >= 3);
  setReq('req-nombre-space', val.includes(' '));
}

function validarCorreo() {
  const val    = document.getElementById('correo').value;
  const parts  = val.split('@');
  const local  = parts[0] || '';
  const domain = parts[1] || '';

  setReq('req-at',      val.includes('@'));
  setReq('req-domain',  /\.\w{2,}$/.test(domain));
  setReq('req-special', /[.\-_]/.test(local));
  setReq('req-num',     /\d/.test(val));
}

function validarPassword() {
  const val = document.getElementById('contrasena').value;
  setReq('req-upper',    /[A-Z]/.test(val));
  setReq('req-pnum',     /\d/.test(val));
  setReq('req-pspecial', /[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(val));
  setReq('req-plen',     val.length >= 8);

  // Revalidar confirmación si ya tiene algo escrito
  if (document.getElementById('confirmar').value) validarConfirmar();
}

function validarConfirmar() {
  const pw1 = document.getElementById('contrasena').value;
  const pw2 = document.getElementById('confirmar').value;
  setReq('req-match', pw1 === pw2 && pw2.length > 0);
}

// ── Helper para marcar requisitos ─────────────────────────

function setReq(id, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('ok', ok);
  el.querySelector('.req-dot').classList.toggle('ok', ok);
}

// ── Funciones de comprobación completa ────────────────────

function nombreValido() {
  const val = document.getElementById('nombre').value.trim();
  return val.length >= 3 && val.includes(' ');
}

function correoValido() {
  const val    = document.getElementById('correo').value;
  const parts  = val.split('@');
  const local  = parts[0] || '';
  const domain = parts[1] || '';
  return val.includes('@') &&
         /\.\w{2,}$/.test(domain) &&
         /[.\-_]/.test(local) &&
         /\d/.test(val);
}

function passValida() {
  const val = document.getElementById('contrasena').value;
  return /[A-Z]/.test(val) &&
         /\d/.test(val) &&
         /[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(val) &&
         val.length >= 8;
}

function confirmacionValida() {
  return document.getElementById('contrasena').value ===
         document.getElementById('confirmar').value;
}


function togglePw(inputId) {
  const input = document.getElementById(inputId);
  input.type = input.type === 'password' ? 'text' : 'password';
}


function shake() {
  const card = document.getElementById('registroCard');
  card.classList.add('shake');
  setTimeout(() => card.classList.remove('shake'), 500);
}

function mostrarError(msg) {
  const err = document.getElementById('errorMsg');
  err.textContent = msg;
  err.style.display = 'block';
  shake();
}

function ocultarError() {
  document.getElementById('errorMsg').style.display = 'none';
}


async function handleRegistro() {
  ocultarError();

  if (!nombreValido()) {
    mostrarError('El nombre debe tener al menos 3 caracteres e incluir nombre y apellido.');
    return;
  }

  if (!correoValido()) {
    mostrarError('El correo no cumple todos los requisitos.');
    return;
  }

  if (!passValida()) {
    mostrarError('La contraseña no cumple todos los requisitos.');
    return;
  }

  if (!confirmacionValida()) {
    mostrarError('Las contraseñas no coinciden.');
    return;
  }

  const nombreCompleto = document.getElementById('nombre').value.trim();
  const primerNombre   = nombreCompleto.split(' ')[0];
  const correo         = document.getElementById('correo').value.trim();
  const contrasena     = document.getElementById('contrasena').value;

  const btn = document.querySelector('.login-btn');
  btn.disabled = true;
  btn.innerHTML = '<span>Registrando...</span>';

  try {
    const resp = await fetch('http://localhost:3000/api/registro', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
       Nombre: nombreCompleto,
        correo,
        contrasena,
        nombre_display: primerNombre
      })
    });

    const data = await resp.json();

    if (!data.ok) {
      mostrarError(data.mensaje);
      btn.disabled = false;
      btn.innerHTML = '<span>Crear cuenta</span><span class="btn-arrow">→</span>';
      return;
    }

    generarSugerencias(primerNombre);
    document.getElementById('nombreDisplay').value = primerNombre;
    document.getElementById('modalOverlay').classList.add('active');

  } catch (err) {
    mostrarError('No se pudo conectar con el servidor. ¿Está corriendo server.js?');
    btn.disabled = false;
    btn.innerHTML = '<span>Crear cuenta</span><span class="btn-arrow">→</span>';
  }
}


function generarSugerencias(primerNombre) {
  const extras     = ['Admin', 'Supervisor'];
  const opciones   = [primerNombre, ...extras].filter(Boolean);
  const contenedor = document.getElementById('sugerenciasAuto');

  contenedor.innerHTML = opciones
    .map(n => `<span onclick="setSugerencia('${n}')">${n}</span>`)
    .join('');
}

function setSugerencia(nombre) {
  document.getElementById('nombreDisplay').value = nombre;
}


function confirmarNombre() {
  const nombre = document.getElementById('nombreDisplay').value.trim() || 'Usuario';
  localStorage.setItem('co_usuario', nombre);

  localStorage.setItem('co_correo', document.getElementById('correo').value.trim());

  window.location.href = 'colmado-ocoa.html';
}


document.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleRegistro();
});