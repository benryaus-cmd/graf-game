export type ShopCategory = 'outfit' | 'top' | 'bottom' | 'accessory';

export interface ShopItem {
  id: string;
  category: ShopCategory;
  slot: ShopCategory;
  name: string;
  detail: string;
  cost: number;
  color?: string;
  exclusive?: boolean;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'outfit:street', category: 'outfit', slot: 'outfit', name: 'Street Starter', detail: 'Your everyday city look', cost: 0, color: '#e87851' },
  { id: 'outfit:jax', category: 'outfit', slot: 'outfit', name: 'Bunny Jax', detail: 'Purple suit · flight', cost: 200, color: '#a55bdd', exclusive: true },
  { id: 'outfit:pomni', category: 'outfit', slot: 'outfit', name: 'Pomni Jester', detail: 'Red and blue · high jump', cost: 200, color: '#dc4451', exclusive: true },
  { id: 'outfit:ringmaster', category: 'outfit', slot: 'outfit', name: 'Ringmaster', detail: 'Red suit and cane · levitation', cost: 200, color: '#b92932', exclusive: true },
  { id: 'outfit:verity', category: 'outfit', slot: 'outfit', name: 'Verity', detail: 'Yellow suit and smiley head', cost: 200, color: '#f1cb36', exclusive: true },
  { id: 'top:coral', category: 'top', slot: 'top', name: 'Coral Tee', detail: 'Warm painted cotton', cost: 0, color: '#e87851' },
  { id: 'top:teal', category: 'top', slot: 'top', name: 'Teal Overshirt', detail: 'Fresh street color', cost: 12, color: '#3e9f9c' },
  { id: 'top:cream', category: 'top', slot: 'top', name: 'Concrete Cream', detail: 'Soft neutral layer', cost: 12, color: '#d9d1bd' },
  { id: 'top:violet', category: 'top', slot: 'top', name: 'Violet Hoodie', detail: 'Deep purple cotton', cost: 12, color: '#8057aa' },
  { id: 'top:blue', category: 'top', slot: 'top', name: 'Cobalt Jacket', detail: 'Bright blue streetwear', cost: 12, color: '#426db3' },
  { id: 'top:lime', category: 'top', slot: 'top', name: 'Lime Windbreaker', detail: 'Acid green pop', cost: 12, color: '#91a94b' },
  { id: 'bottom:charcoal', category: 'bottom', slot: 'bottom', name: 'Charcoal Trousers', detail: 'Everyday black denim', cost: 0, color: '#353a40' },
  { id: 'bottom:denim', category: 'bottom', slot: 'bottom', name: 'Blue Denim', detail: 'Classic worn denim', cost: 14, color: '#466280' },
  { id: 'bottom:plum', category: 'bottom', slot: 'bottom', name: 'Plum Cargo', detail: 'Dark purple cargo pants', cost: 14, color: '#59435f' },
  { id: 'bottom:olive', category: 'bottom', slot: 'bottom', name: 'Olive Utility', detail: 'City-ready olive', cost: 14, color: '#596341' },
  { id: 'bottom:rust', category: 'bottom', slot: 'bottom', name: 'Rust Workwear', detail: 'Warm brick red', cost: 14, color: '#a7513d' },
  { id: 'accessory:none', category: 'accessory', slot: 'accessory', name: 'No Accessory', detail: 'Keep it simple', cost: 0 },
  { id: 'accessory:cap', category: 'accessory', slot: 'accessory', name: 'Cool Cap', detail: 'A soft brimmed cap', cost: 18, color: '#dc6046' },
  { id: 'accessory:headphones', category: 'accessory', slot: 'accessory', name: 'Studio Headphones', detail: 'Lo-fi listening gear', cost: 20, color: '#383843' },
  { id: 'accessory:shades', category: 'accessory', slot: 'accessory', name: 'Night Shades', detail: 'Dark city sunglasses', cost: 16, color: '#1d252b' },
  { id: 'accessory:backpack', category: 'accessory', slot: 'accessory', name: 'Canvas Backpack', detail: 'Room for paint cans', cost: 22, color: '#587365' },
  { id: 'accessory:scarf', category: 'accessory', slot: 'accessory', name: 'Coral Scarf', detail: 'A bright neck wrap', cost: 18, color: '#e87365' },
  { id: 'accessory:smileyBall', category: 'accessory', slot: 'accessory', name: 'Verity Shoulder Ball', detail: 'A little yellow smiley buddy', cost: 24, color: '#f4d447' },
  { id: 'accessory:tie', category: 'accessory', slot: 'accessory', name: 'Painted Tie', detail: 'A sharp pop of color', cost: 16, color: '#d7374a' },
  { id: 'accessory:wings', category: 'accessory', slot: 'accessory', name: 'Cloud Wings', detail: 'Soft wings for your back', cost: 32, color: '#e5e1d8' },
  { id: 'accessory:basketball', category: 'accessory', slot: 'accessory', name: 'Basketball', detail: 'Carry a court classic', cost: 22, color: '#e97930' },
  { id: 'accessory:sprayCan', category: 'accessory', slot: 'accessory', name: 'Hand Spray Can', detail: 'Your favorite painting tool', cost: 20, color: '#d7d3c9' },
];