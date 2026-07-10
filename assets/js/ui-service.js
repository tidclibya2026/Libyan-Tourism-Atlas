export function uniqueSorted(values){
  return [...new Set(values.filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b),'ar'));
}

export function fillSelect(select, values, firstLabel){
  select.innerHTML = `<option value="">${firstLabel}</option>`;
  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

export function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));
}
