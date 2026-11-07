try {
  if (!localStorage.getItem('formvis.dialogSpots')) localStorage.setItem('formvis.dialogSpots', JSON.stringify({ 'Levels Layer': { x: 250, y: 0 } }));
} catch { /* the dialog opens centred */ }
