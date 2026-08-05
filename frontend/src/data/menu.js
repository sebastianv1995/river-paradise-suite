import menu from '../../../menu.json';

export const MENU = menu;

export function findMenuItem(itemId) {
  for (const items of Object.values(MENU)) {
    const found = items.find(item => item.id === itemId);
    if (found) return found;
  }
  return null;
}
