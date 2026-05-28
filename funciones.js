const ADMIN_CORREO = 'Admin.1!@gmail.com';

function validarCorreo() {
  const val   = document.getElementById('correo').value;
  const parts = val.split('@');
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
}

function setReq(id, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('ok', ok);
  el.querySelector('.req-dot').classList.toggle('ok', ok);
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
         /[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(val);
}

function togglePw() {
  const input = document.getElementById('contrasena');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function shake() {
  const card = document.getElementById('loginCard');
  card.classList.add('shake');
  setTimeout(() => card.classList.remove('shake'), 500);
}

function mostrarError(msg) {
  const err = document.getElementById('errorMsg');
  err.textContent = msg;
  err.style.display = 'block';
  shake();
}

async function handleLogin() {
  const err = document.getElementById('errorMsg');
  err.style.display = 'none';

  if (!correoValido()) { mostrarError('El correo no cumple todos los requisitos.'); return; }
  if (!passValida())   { mostrarError('La contraseña no cumple todos los requisitos.'); return; }

  const correo     = document.getElementById('correo').value.trim();
  const contrasena = document.getElementById('contrasena').value;

  const btn = document.querySelector('.login-btn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Verificando...';

  try {
    const resp = await fetch('http://localhost:3000/api/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo, contrasena })
    });

    const data = await resp.json();

    if (!data.ok) {
      mostrarError(data.mensaje || 'Credenciales incorrectas.');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Iniciar Sesión';
      return;
    }

    const usuario = data.usuario;
    localStorage.setItem('co_usuario', usuario.nombre_display || usuario.Nombre);
    localStorage.setItem('co_correo',  correo);

    // Si es admin → panel de admin, si no → inicio normal
    if (correo.toLowerCase() === ADMIN_CORREO.toLowerCase()) {
      localStorage.setItem('co_rol', 'admin');
      window.location.href = 'admin.html';
    } else {
      localStorage.setItem('co_rol', 'usuario');
      window.location.href = 'colmado-ocoa.html';
    }

  } catch (e) {
    mostrarError('No se pudo conectar con el servidor. ¿Está corriendo server.js?');
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Iniciar Sesión';
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});