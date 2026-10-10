// Keep startup failures visible even when a game module cannot initialize.
const start = document.getElementById('start');
start.disabled = true;
start.textContent = 'LOADING ZURICH…';
try {
  await import('./main.js');
} catch (error) {
  console.error('Game startup failed:', error);
  document.getElementById('overlay').style.display = 'flex';
  document.querySelector('.intro p').textContent = `Could not start the game: ${error.message || error}. Press retry to reload.`;
  start.textContent = 'RETRY ↗';
  start.disabled = false;
  start.onclick = () => location.reload();
}
