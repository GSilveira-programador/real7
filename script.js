<!-- ================= JS (script.js) ================= -->
setTimeout(() => {
  document.getElementById('loader').style.display = 'none';
  document.querySelector('.app').classList.remove('hidden');
}, 2000);

function openTab(id, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sidebar button').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  el.classList.add('active');
}

function toggleCard(card) {
  card.classList.toggle('open');
}
