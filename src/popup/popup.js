// Point d'entrée de la popup. Pour l'instant : simple "hello world"
// pour valider que le manifest, le chargement et le DOM fonctionnent.
document.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('status');
  status.textContent = 'fogbank prêt.';
});
