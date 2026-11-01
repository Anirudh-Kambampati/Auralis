// Rules and house layout shared by server and client.

export const ROOM_W = 10;
export const ROOM_H = 8;
// The house is a square grid that grows with it: 1 room = 1x1, 2-4 = 2x2, 5-9 = 3x3, and so on.
export const colsFor = (n) => Math.max(1, Math.ceil(Math.sqrt(n)));
export const WALL_H = 2; // back wall is two tiles tall so windows and wallpaper have room

// colors: which palette the owner can recolour the item with for free ('pastel' or 'wood').
// act: what a character does on top of it. use: what they do standing in front of it. pet: what a pet does at it. table: a study desk. chair: a desk chair.
// top: small things (drinks, pet toys) that can stand on tables and rugs; they only collide with each other.
export const ITEMS = {
  desk: { name: 'Desk', w: 2, h: 1, price: 0, solid: true, colors: 'wood', table: true },
  chair: { name: 'Chair', w: 1, h: 1, price: 0, solid: true, colors: 'pastel', act: 'sit', chair: true },
  books: { name: 'Book stack', w: 1, h: 1, price: 8, solid: true , use: 'read' },
  cactus: { name: 'Cactus', w: 1, h: 1, price: 9, solid: true , use: 'water' },
  plant: { name: 'Plant', w: 1, h: 1, price: 11, solid: true, colors: 'pastel', looks: ['Leafy', 'Monstera', 'Snake plant'] , use: 'water' },
  sunflower: { name: 'Sunflower', w: 1, h: 1, price: 14, solid: true, colors: 'pastel', use: 'water' },
  lamp: { name: 'Lamp', w: 1, h: 1, price: 15, solid: true, colors: 'pastel', looks: ['Shade', 'Lava lamp', 'Paper lantern'] , use: 'read' },
  rug: { name: 'Rug', w: 3, h: 2, price: 25, solid: false, colors: 'pastel', looks: ['Hearts', 'Stripes', 'Checks'] },
  globe: { name: 'Globe', w: 1, h: 1, price: 25, solid: true , use: 'read' },
  beanbag: { name: 'Beanbag', w: 1, h: 1, price: 25, solid: true, colors: 'pastel', act: 'sit' },
  roundRug: { name: 'Round rug', w: 2, h: 2, price: 25, solid: false, colors: 'pastel' },
  bookshelf: { name: 'Bookshelf', w: 2, h: 1, price: 30, solid: true, colors: 'wood', looks: ['Classic', 'Ladder', 'Cubbies'] , use: 'read' },
  coffeeTable: { name: 'Coffee table', w: 2, h: 1, price: 30, solid: true, colors: 'wood', looks: ['Wood', 'Glass', 'Round'] , use: 'tea' },
  armchair: { name: 'Armchair', w: 1, h: 1, price: 35, solid: true, colors: 'pastel', act: 'sit', looks: ['Classic', 'Wingback', 'Egg chair'] },
  plush: { name: 'Plush bear', w: 1, h: 1, price: 40, solid: true, colors: 'pastel', use: 'hug' },
  mirror: { name: 'Mirror', w: 1, h: 1, price: 40, solid: true, colors: 'wood', use: 'primp' },
  recordPlayer: { name: 'Record player', w: 1, h: 1, price: 40, solid: true, colors: 'wood', use: 'dance' },
  bed: { name: 'Bed', w: 2, h: 3, price: 45, solid: true, colors: 'pastel', act: 'sleep', looks: ['Classic', 'Canopy', 'Futon'] },
  guitar: { name: 'Guitar', w: 1, h: 1, price: 45, solid: true , use: 'strum' },
  easel: { name: 'Easel', w: 1, h: 1, price: 50, solid: true , use: 'paint' },
  sofa: { name: 'Sofa', w: 3, h: 1, price: 55, solid: true, colors: 'pastel', act: 'sit', looks: ['Classic', 'Modern', 'Chesterfield'] },
  bonsai: { name: 'Bonsai', w: 1, h: 1, price: 55, solid: true , use: 'water' },
  wardrobe: { name: 'Wardrobe', w: 2, h: 1, price: 60, solid: true, colors: 'wood', looks: ['Classic', 'Mirrored', 'Sliding'] , use: 'dress' },
  aquarium: { name: 'Aquarium', w: 2, h: 1, price: 70, solid: true , use: 'feed' },
  piano: { name: 'Piano', w: 2, h: 1, price: 115, solid: true, colors: 'wood', use: 'music' },
  // workspace
  workTable: { name: 'Work table', w: 2, h: 1, price: 40, solid: true, colors: 'wood', table: true },
  pcDesk: { name: 'PC desk', w: 2, h: 1, price: 70, solid: true, colors: 'wood', table: true },
  gamingDesk: { name: 'Gaming desk', w: 2, h: 1, price: 90, solid: true, table: true },
  officeChair: { name: 'Office chair', w: 1, h: 1, price: 30, solid: true, colors: 'pastel', act: 'sit', chair: true },
  gamingChair: { name: 'Gaming chair', w: 1, h: 1, price: 55, solid: true, colors: 'pastel', act: 'sit', chair: true },
  miniFridge: { name: 'Mini fridge', w: 1, h: 1, price: 40, solid: true, colors: 'pastel', use: 'snack' },
  coffee: { name: 'Coffee', w: 1, h: 1, price: 4, solid: false, top: true },
  energyCan: { name: 'White energy drink', w: 1, h: 1, price: 6, solid: false, top: true },
  soda: { name: 'Lemon-lime soda', w: 1, h: 1, price: 5, solid: false, top: true },
  wine: { name: 'Wine & glass', w: 1, h: 1, price: 19, solid: false, top: true },
  // fitness
  gymBall: { name: 'Gym ball', w: 1, h: 1, price: 25, solid: true, colors: 'pastel', act: 'bounce' },
  dumbbells: { name: 'Dumbbells', w: 1, h: 1, price: 35, solid: true, colors: 'pastel', act: 'lift' },
  punchingBag: { name: 'Punching bag', w: 1, h: 1, price: 55, solid: true, colors: 'pastel', act: 'punch' },
  exerciseBike: { name: 'Exercise bike', w: 1, h: 1, price: 85, solid: true, colors: 'pastel', act: 'bike' },
  treadmill: { name: 'Treadmill', w: 1, h: 1, price: 105, solid: true, act: 'run' },
  // kitchen
  counter: { name: 'Kitchen counter', w: 2, h: 1, price: 40, solid: true, colors: 'wood', use: 'cook' },
  sink: { name: 'Kitchen sink', w: 1, h: 1, price: 35, solid: true , use: 'wash' },
  stove: { name: 'Stove', w: 1, h: 1, price: 55, solid: true , use: 'cook' },
  fridge: { name: 'Fridge', w: 1, h: 1, price: 70, solid: true, colors: 'pastel', use: 'snack' },
  diningTable: { name: 'Dining table', w: 2, h: 1, price: 45, solid: true, colors: 'wood', use: 'tea' },
  barStool: { name: 'Bar stool', w: 1, h: 1, price: 15, solid: true, colors: 'pastel', act: 'sit' },
  microwave: { name: 'Microwave', w: 1, h: 1, price: 25, solid: false, top: true },
  teapot: { name: 'Teapot', w: 1, h: 1, price: 9, solid: false, top: true, colors: 'pastel' },
  fruitBowl: { name: 'Fruit bowl', w: 1, h: 1, price: 8, solid: false, top: true },
  cake: { name: 'Cake', w: 1, h: 1, price: 11, solid: false, top: true },
  // bathroom
  bathtub: { name: 'Bathtub', w: 2, h: 1, price: 85, solid: true, colors: 'pastel', use: 'wash' },
  toilet: { name: 'Toilet', w: 1, h: 1, price: 30, solid: true , use: 'wash' },
  vanity: { name: 'Vanity', w: 1, h: 1, price: 40, solid: true, colors: 'wood', use: 'primp' },
  towelRack: { name: 'Towel rack', w: 1, h: 1, price: 15, solid: true, colors: 'pastel', use: 'wash' },
  // bedroom
  nightstand: { name: 'Nightstand', w: 1, h: 1, price: 19, solid: true, colors: 'wood', use: 'read' },
  dresser: { name: 'Dresser', w: 2, h: 1, price: 45, solid: true, colors: 'wood', use: 'dress' },
  clothesRack: { name: 'Clothes rack', w: 2, h: 1, price: 40, solid: true , use: 'dress' },
  // living room
  tv: { name: 'TV stand', w: 2, h: 1, price: 90, solid: true, colors: 'wood', use: 'game' },
  fireplace: { name: 'Fireplace', w: 2, h: 1, price: 120, solid: true , use: 'warm' },
  floorCushion: { name: 'Floor cushion', w: 1, h: 1, price: 11, solid: true, colors: 'pastel', act: 'sit' },
  standingFan: { name: 'Standing fan', w: 1, h: 1, price: 25, solid: true , use: 'cool' },
  grandClock: { name: 'Grandfather clock', w: 1, h: 1, price: 70, solid: true, colors: 'wood', use: 'wind' },
  sideTable: { name: 'Side table', w: 1, h: 1, price: 15, solid: true, colors: 'wood', use: 'tea' },
  // games and music
  arcade: { name: 'Arcade cabinet', w: 1, h: 1, price: 135, solid: true, colors: 'pastel', use: 'game' },
  gameConsole: { name: 'Game console', w: 1, h: 1, price: 45, solid: false, top: true },
  speaker: { name: 'Speaker', w: 1, h: 1, price: 30, solid: true , use: 'dance' },
  drumKit: { name: 'Drum kit', w: 2, h: 1, price: 120, solid: true, colors: 'pastel', use: 'drum' },
  synth: { name: 'Synth keyboard', w: 2, h: 1, price: 90, solid: true , use: 'music' },
  djDeck: { name: 'DJ deck', w: 2, h: 1, price: 105, solid: true , use: 'dj' },
  telescope: { name: 'Telescope', w: 1, h: 1, price: 65, solid: true, colors: 'pastel', use: 'stargaze' },
  poolTable: { name: 'Pool table', w: 3, h: 2, price: 165, solid: true, colors: 'wood', use: 'play' },
  foosball: { name: 'Foosball table', w: 2, h: 1, price: 100, solid: true , use: 'play' },
  trampoline: { name: 'Mini trampoline', w: 2, h: 2, price: 75, solid: true, colors: 'pastel', act: 'bounce' },
  // more plants
  palm: { name: 'Palm', w: 1, h: 1, price: 30, solid: true, colors: 'pastel', use: 'water' },
  tulips: { name: 'Tulips', w: 1, h: 1, price: 15, solid: true, colors: 'pastel', use: 'water' },
  fig: { name: 'Fig tree', w: 1, h: 1, price: 40, solid: true, colors: 'pastel', use: 'water' },
  terrarium: { name: 'Terrarium', w: 1, h: 1, price: 19, solid: false, top: true },
  succulent: { name: 'Succulent', w: 1, h: 1, price: 6, solid: false, top: true, colors: 'pastel' },
  // seasonal
  pumpkin: { name: 'Jack-o-lantern', w: 1, h: 1, price: 19, solid: true , use: 'admire' },
  christmasTree: { name: 'Holiday tree', w: 1, h: 1, price: 70, solid: true , use: 'admire' },
  snowman: { name: 'Snowman', w: 1, h: 1, price: 25, solid: true , use: 'admire' },
  giftBox: { name: 'Gift box', w: 1, h: 1, price: 8, solid: false, top: true, colors: 'pastel', use: 'admire' },
  // pet corner
  petBall: { name: 'Pet ball', w: 1, h: 1, price: 8, solid: false, top: true, pet: 'chase' },
  petBed: { name: 'Pet bed', w: 1, h: 1, price: 25, solid: false, top: true, colors: 'pastel', pet: 'sleep' },
  doghouse: { name: 'Doghouse', w: 1, h: 1, price: 45, solid: true, colors: 'wood', pet: 'sleep', use: 'admire' },
  catTower: { name: 'Cat tower', w: 1, h: 1, price: 60, solid: true, colors: 'pastel', pet: 'perch', use: 'admire' },
  // ---- more of everything: drawn from shape recipes in draw.ts ----
  rockingChair: { name: 'Rocking chair', w: 1, h: 1, price: 30, solid: true, colors: 'pastel', act: 'sit', shelf: 'cozy' },
  bench: { name: 'Garden bench', w: 2, h: 1, price: 25, solid: true, colors: 'wood', act: 'sit', shelf: 'cozy' },
  loveseat: { name: 'Loveseat', w: 2, h: 1, price: 40, solid: true, colors: 'pastel', act: 'sit', shelf: 'cozy' },
  pouf: { name: 'Pouf', w: 1, h: 1, price: 14, solid: true, colors: 'pastel', act: 'sit', shelf: 'cozy' },
  swingChair: { name: 'Hanging egg chair', w: 1, h: 1, price: 65, solid: true, colors: 'pastel', act: 'sit', shelf: 'cozy' },
  throne: { name: 'Royal throne', w: 1, h: 1, price: 120, solid: true, colors: 'pastel', act: 'sit', shelf: 'cozy' },
  sectional: { name: 'Corner sofa', w: 3, h: 1, price: 70, solid: true, colors: 'pastel', act: 'sit', shelf: 'cozy' },
  diningChair: { name: 'Dining chair', w: 1, h: 1, price: 19, solid: true, colors: 'wood', act: 'sit', shelf: 'cozy' },
  chaise: { name: 'Chaise lounge', w: 2, h: 1, price: 55, solid: true, colors: 'pastel', act: 'sit', shelf: 'cozy' },
  hammock: { name: 'Hammock', w: 3, h: 1, price: 50, solid: true, colors: 'pastel', act: 'sit', shelf: 'cozy' },
  giantBeanbag: { name: 'Giant beanbag', w: 2, h: 1, price: 40, solid: true, colors: 'pastel', act: 'sit', shelf: 'cozy' },
  saucerChair: { name: 'Saucer chair', w: 1, h: 1, price: 35, solid: true, colors: 'pastel', act: 'sit', shelf: 'cozy' },
  stumpSeat: { name: 'Tree stump', w: 1, h: 1, price: 11, solid: true, act: 'sit', shelf: 'cozy' },
  clubChair: { name: 'Club chair', w: 1, h: 1, price: 45, solid: true, colors: 'wood', act: 'sit', shelf: 'cozy' },
  ottoman: { name: 'Ottoman', w: 1, h: 1, price: 15, solid: true, colors: 'pastel', act: 'sit', shelf: 'cozy' },
  bunkBed: { name: 'Bunk bed', w: 2, h: 3, price: 90, solid: true, colors: 'pastel', act: 'sleep', shelf: 'bedroom' },
  singleBed: { name: 'Single bed', w: 1, h: 2, price: 35, solid: true, colors: 'pastel', act: 'sleep', shelf: 'bedroom' },
  daybed: { name: 'Daybed', w: 2, h: 1, price: 55, solid: true, colors: 'pastel', act: 'sleep', shelf: 'bedroom' },
  cloudBed: { name: 'Cloud bed', w: 2, h: 2, price: 105, solid: true, colors: 'pastel', act: 'sleep', shelf: 'bedroom' },
  makeupTable: { name: 'Makeup table', w: 2, h: 1, price: 55, solid: true, colors: 'wood', use: 'primp', shelf: 'bedroom' },
  jewelryBox: { name: 'Jewelry box', w: 1, h: 1, price: 11, solid: false, top: true, colors: 'pastel', shelf: 'bedroom' },
  bedsideLamp: { name: 'Bedside lamp', w: 1, h: 1, price: 9, solid: false, top: true, colors: 'pastel', shelf: 'bedroom' },
  hamper: { name: 'Laundry hamper', w: 1, h: 1, price: 14, solid: true, use: 'dress', shelf: 'bedroom' },
  shoeRack: { name: 'Shoe rack', w: 2, h: 1, price: 25, solid: true, colors: 'wood', use: 'dress', shelf: 'bedroom' },
  tallDrawers: { name: 'Tall drawers', w: 1, h: 1, price: 40, solid: true, colors: 'wood', use: 'dress', shelf: 'bedroom' },
  blanketLadder: { name: 'Blanket ladder', w: 1, h: 1, price: 19, solid: true, colors: 'pastel', use: 'dress', shelf: 'bedroom' },
  dressingScreen: { name: 'Dressing screen', w: 2, h: 1, price: 45, solid: true, colors: 'pastel', use: 'dress', shelf: 'bedroom' },
  toyChest: { name: 'Toy chest', w: 2, h: 1, price: 30, solid: true, colors: 'pastel', use: 'admire', shelf: 'bedroom' },
  alarmClock: { name: 'Alarm clock', w: 1, h: 1, price: 6, solid: false, top: true, colors: 'pastel', shelf: 'bedroom' },
  arcLamp: { name: 'Arc floor lamp', w: 1, h: 1, price: 35, solid: true, colors: 'pastel', use: 'read', shelf: 'living' },
  tallBookcase: { name: 'Tall bookcase', w: 1, h: 1, price: 40, solid: true, colors: 'wood', use: 'read', shelf: 'living' },
  recordCrate: { name: 'Record crate', w: 1, h: 1, price: 17, solid: true, colors: 'wood', use: 'dance', shelf: 'living' },
  mediaConsole: { name: 'Media console', w: 2, h: 1, price: 55, solid: true, colors: 'wood', use: 'game', shelf: 'living' },
  radiator: { name: 'Radiator', w: 2, h: 1, price: 25, solid: true, use: 'warm', shelf: 'living' },
  heater: { name: 'Space heater', w: 1, h: 1, price: 25, solid: true, colors: 'pastel', use: 'warm', shelf: 'living' },
  airPurifier: { name: 'Air purifier', w: 1, h: 1, price: 30, solid: true, use: 'cool', shelf: 'living' },
  projector: { name: 'Projector', w: 1, h: 1, price: 35, solid: false, top: true, shelf: 'living' },
  magazineRack: { name: 'Magazine rack', w: 1, h: 1, price: 14, solid: true, colors: 'wood', use: 'read', shelf: 'living' },
  consoleTable: { name: 'Console table', w: 2, h: 1, price: 35, solid: true, colors: 'wood', use: 'tea', shelf: 'living' },
  candles: { name: 'Candle cluster', w: 1, h: 1, price: 9, solid: false, top: true, shelf: 'living' },
  photoFrames: { name: 'Photo frames', w: 1, h: 1, price: 8, solid: false, top: true, shelf: 'living' },
  fishBowl: { name: 'Fish bowl', w: 1, h: 1, price: 15, solid: false, top: true, shelf: 'living' },
  island: { name: 'Kitchen island', w: 2, h: 1, price: 65, solid: true, colors: 'wood', use: 'cook', shelf: 'kitchen' },
  dishwasher: { name: 'Dishwasher', w: 1, h: 1, price: 45, solid: true, use: 'wash', shelf: 'kitchen' },
  oven: { name: 'Wall oven', w: 1, h: 1, price: 60, solid: true, use: 'cook', shelf: 'kitchen' },
  coffeeMachine: { name: 'Coffee machine', w: 1, h: 1, price: 25, solid: false, top: true, shelf: 'kitchen' },
  toaster: { name: 'Toaster', w: 1, h: 1, price: 14, solid: false, top: true, colors: 'pastel', shelf: 'kitchen' },
  kettle: { name: 'Kettle', w: 1, h: 1, price: 11, solid: false, top: true, colors: 'pastel', shelf: 'kitchen' },
  blender: { name: 'Blender', w: 1, h: 1, price: 17, solid: false, top: true, colors: 'pastel', shelf: 'kitchen' },
  riceCooker: { name: 'Rice cooker', w: 1, h: 1, price: 15, solid: false, top: true, shelf: 'kitchen' },
  spiceRack: { name: 'Spice rack', w: 1, h: 1, price: 19, solid: true, colors: 'wood', use: 'cook', shelf: 'kitchen' },
  pantry: { name: 'Pantry shelf', w: 1, h: 1, price: 45, solid: true, colors: 'wood', use: 'snack', shelf: 'kitchen' },
  cookieJar: { name: 'Cookie jar', w: 1, h: 1, price: 8, solid: false, top: true, shelf: 'kitchen' },
  fern: { name: 'Fern', w: 1, h: 1, price: 14, solid: true, colors: 'pastel', use: 'water', shelf: 'plants' },
  cherryTree: { name: 'Cherry blossom', w: 1, h: 1, price: 55, solid: true, colors: 'pastel', use: 'water', shelf: 'plants' },
  lavender: { name: 'Lavender', w: 1, h: 1, price: 15, solid: true, colors: 'pastel', use: 'water', shelf: 'plants' },
  roses: { name: 'Rose bush', w: 1, h: 1, price: 25, solid: true, colors: 'pastel', use: 'water', shelf: 'plants' },
  orchid: { name: 'Orchid', w: 1, h: 1, price: 25, solid: true, colors: 'pastel', use: 'water', shelf: 'plants' },
  ivy: { name: 'Ivy stand', w: 1, h: 1, price: 25, solid: true, colors: 'pastel', use: 'water', shelf: 'plants' },
  aloe: { name: 'Aloe vera', w: 1, h: 1, price: 11, solid: true, colors: 'pastel', use: 'water', shelf: 'plants' },
  moneyTree: { name: 'Money tree', w: 1, h: 1, price: 35, solid: true, colors: 'pastel', use: 'water', shelf: 'plants' },
  lemonTree: { name: 'Lemon tree', w: 1, h: 1, price: 45, solid: true, colors: 'pastel', use: 'water', shelf: 'plants' },
  mushrooms: { name: 'Mushroom pot', w: 1, h: 1, price: 14, solid: true, colors: 'pastel', use: 'water', shelf: 'plants' },
  olive: { name: 'Olive tree', w: 1, h: 1, price: 40, solid: true, colors: 'pastel', use: 'water', shelf: 'plants' },
  vase: { name: 'Tall vase', w: 1, h: 1, price: 15, solid: true, colors: 'pastel', use: 'admire', shelf: 'decor' },
  bust: { name: 'Marble bust', w: 1, h: 1, price: 45, solid: true, use: 'admire', shelf: 'decor' },
  discoBall: { name: 'Disco ball', w: 1, h: 1, price: 70, solid: true, use: 'dance', shelf: 'decor' },
  neonHeart: { name: 'Neon heart', w: 1, h: 1, price: 40, solid: true, colors: 'pastel', use: 'admire', shelf: 'decor' },
  ovalRug: { name: 'Oval rug', w: 3, h: 2, price: 25, solid: false, colors: 'pastel', shelf: 'decor' },
  runnerRug: { name: 'Runner rug', w: 1, h: 3, price: 19, solid: false, colors: 'pastel', shelf: 'decor' },
  fairyJar: { name: 'Fairy-light jar', w: 1, h: 1, price: 11, solid: false, top: true, shelf: 'decor' },
  snowGlobe: { name: 'Snow globe', w: 1, h: 1, price: 14, solid: false, top: true, shelf: 'decor' },
  hourglass: { name: 'Hourglass', w: 1, h: 1, price: 9, solid: false, top: true, shelf: 'decor' },
  floorCandle: { name: 'Floor candles', w: 1, h: 1, price: 19, solid: true, use: 'admire', shelf: 'decor' },
  bigTeddy: { name: 'Giant teddy', w: 1, h: 1, price: 55, solid: true, colors: 'pastel', use: 'hug', shelf: 'decor' },
  birdcage: { name: 'Birdcage', w: 1, h: 1, price: 40, solid: true, use: 'admire', shelf: 'decor' },
  sculpture: { name: 'Abstract sculpture', w: 1, h: 1, price: 35, solid: true, colors: 'pastel', use: 'admire', shelf: 'decor' },
  standingDesk: { name: 'Standing desk', w: 2, h: 1, price: 75, solid: true, colors: 'wood', table: true, shelf: 'work' },
  draftingTable: { name: 'Drafting table', w: 2, h: 1, price: 55, solid: true, colors: 'wood', table: true, shelf: 'work' },
  filingCabinet: { name: 'Filing cabinet', w: 1, h: 1, price: 25, solid: true, colors: 'pastel', use: 'read', shelf: 'work' },
  whiteboard: { name: 'Whiteboard', w: 2, h: 1, price: 30, solid: true, use: 'read', shelf: 'work' },
  printer: { name: 'Printer', w: 1, h: 1, price: 25, solid: false, top: true, shelf: 'work' },
  laptop: { name: 'Laptop', w: 1, h: 1, price: 40, solid: false, top: true, colors: 'pastel', shelf: 'work' },
  monitor: { name: 'Monitor', w: 1, h: 1, price: 35, solid: false, top: true, shelf: 'work' },
  pencilCup: { name: 'Pencil cup', w: 1, h: 1, price: 4, solid: false, top: true, shelf: 'work' },
  bubbleTea: { name: 'Bubble tea', w: 1, h: 1, price: 5, solid: false, top: true, shelf: 'work' },
  orangeJuice: { name: 'Orange juice', w: 1, h: 1, price: 5, solid: false, top: true, shelf: 'work' },
  harp: { name: 'Harp', w: 1, h: 1, price: 100, solid: true, use: 'strum', shelf: 'fun' },
  cello: { name: 'Cello', w: 1, h: 1, price: 85, solid: true, use: 'strum', shelf: 'fun' },
  violin: { name: 'Violin stand', w: 1, h: 1, price: 55, solid: true, use: 'strum', shelf: 'fun' },
  microphone: { name: 'Mic stand', w: 1, h: 1, price: 30, solid: true, use: 'music', shelf: 'fun' },
  sewingTable: { name: 'Sewing table', w: 1, h: 1, price: 60, solid: true, use: 'paint', shelf: 'fun' },
  potteryWheel: { name: 'Pottery wheel', w: 1, h: 1, price: 55, solid: true, use: 'paint', shelf: 'fun' },
  typewriter: { name: 'Typewriter', w: 1, h: 1, price: 30, solid: false, top: true, shelf: 'fun' },
  tripod: { name: 'Camera tripod', w: 1, h: 1, price: 45, solid: true, use: 'admire', shelf: 'fun' },
  craftTable: { name: 'Craft table', w: 2, h: 1, price: 40, solid: true, colors: 'wood', use: 'paint', shelf: 'fun' },
  loom: { name: 'Weaving loom', w: 2, h: 1, price: 70, solid: true, use: 'paint', shelf: 'fun' },
  saxophone: { name: 'Saxophone', w: 1, h: 1, price: 65, solid: true, use: 'music', shelf: 'fun' },
  chessTable: { name: 'Chess table', w: 1, h: 1, price: 55, solid: true, colors: 'wood', use: 'play', shelf: 'games' },
  airHockey: { name: 'Air hockey', w: 2, h: 1, price: 115, solid: true, use: 'play', shelf: 'games' },
  pinball: { name: 'Pinball machine', w: 1, h: 1, price: 120, solid: true, colors: 'pastel', use: 'game', shelf: 'games' },
  clawMachine: { name: 'Claw machine', w: 1, h: 1, price: 145, solid: true, colors: 'pastel', use: 'game', shelf: 'games' },
  dartboard: { name: 'Dartboard', w: 1, h: 1, price: 25, solid: true, use: 'play', shelf: 'games' },
  pingPong: { name: 'Ping pong table', w: 3, h: 2, price: 135, solid: true, use: 'play', shelf: 'games' },
  boardGame: { name: 'Board game', w: 1, h: 1, price: 9, solid: false, top: true, shelf: 'games' },
  puzzleTable: { name: 'Puzzle table', w: 2, h: 1, price: 40, solid: true, colors: 'wood', use: 'play', shelf: 'games' },
  ballPit: { name: 'Ball pit', w: 2, h: 2, price: 70, solid: true, colors: 'pastel', act: 'bounce', shelf: 'games' },
  bowling: { name: 'Bowling set', w: 1, h: 1, price: 30, solid: true, use: 'play', shelf: 'games' },
  rockingHorse: { name: 'Rocking horse', w: 1, h: 1, price: 45, solid: true, colors: 'pastel', act: 'sit', shelf: 'games' },
  vrHeadset: { name: 'VR headset', w: 1, h: 1, price: 55, solid: false, top: true, shelf: 'games' },
  gamerBeanbag: { name: 'Gamer beanbag', w: 1, h: 1, price: 35, solid: true, act: 'sit', shelf: 'games' },
  karaoke: { name: 'Karaoke machine', w: 1, h: 1, price: 65, solid: true, colors: 'pastel', use: 'music', shelf: 'games' },
  retroTV: { name: 'Retro TV', w: 1, h: 1, price: 70, solid: true, colors: 'wood', use: 'game', shelf: 'games' },
  yogaMat: { name: 'Yoga mat', w: 1, h: 1, price: 15, solid: true, colors: 'pastel', act: 'stretch', shelf: 'fitness' },
  rowingMachine: { name: 'Rowing machine', w: 2, h: 1, price: 100, solid: true, act: 'bike', shelf: 'fitness' },
  kettlebells: { name: 'Kettlebells', w: 1, h: 1, price: 25, solid: true, colors: 'pastel', act: 'lift', shelf: 'fitness' },
  pullUpBar: { name: 'Pull-up bar', w: 1, h: 1, price: 55, solid: true, act: 'lift', shelf: 'fitness' },
  weightBench: { name: 'Weight bench', w: 2, h: 1, price: 85, solid: true, act: 'lift', shelf: 'fitness' },
  stepper: { name: 'Stair stepper', w: 1, h: 1, price: 60, solid: true, act: 'run', shelf: 'fitness' },
  jumpRope: { name: 'Jump rope', w: 1, h: 1, price: 11, solid: true, act: 'run', shelf: 'fitness' },
  balanceBoard: { name: 'Balance board', w: 1, h: 1, price: 25, solid: true, colors: 'wood', act: 'stretch', shelf: 'fitness' },
  foamRoller: { name: 'Foam roller', w: 1, h: 1, price: 11, solid: true, colors: 'pastel', act: 'stretch', shelf: 'fitness' },
  speedBag: { name: 'Speed bag', w: 1, h: 1, price: 40, solid: true, act: 'punch', shelf: 'fitness' },
  climbingWall: { name: 'Climbing wall', w: 2, h: 1, price: 165, solid: true, act: 'lift', shelf: 'fitness' },
  elliptical: { name: 'Elliptical', w: 1, h: 1, price: 105, solid: true, act: 'run', shelf: 'fitness' },
  hulaHoop: { name: 'Hula hoop', w: 1, h: 1, price: 9, solid: true, act: 'stretch', shelf: 'fitness' },
  medicineBalls: { name: 'Medicine balls', w: 1, h: 1, price: 30, solid: true, act: 'lift', shelf: 'fitness' },
  boxingDummy: { name: 'Boxing dummy', w: 1, h: 1, price: 90, solid: true, act: 'punch', shelf: 'fitness' },
  scratchPost: { name: 'Scratching post', w: 1, h: 1, price: 19, solid: true, colors: 'pastel', pet: 'perch', shelf: 'petstuff' },
  hamsterWheel: { name: 'Hamster wheel', w: 1, h: 1, price: 25, solid: true, pet: 'chase', shelf: 'petstuff' },
  birdPerch: { name: 'Bird perch', w: 1, h: 1, price: 25, solid: true, pet: 'perch', shelf: 'petstuff' },
  petTent: { name: 'Pet tent', w: 1, h: 1, price: 35, solid: true, colors: 'pastel', pet: 'sleep', shelf: 'petstuff' },
  petSofa: { name: 'Pet sofa', w: 1, h: 1, price: 30, solid: true, colors: 'pastel', pet: 'sleep', shelf: 'petstuff' },
  foodBowl: { name: 'Food bowl', w: 1, h: 1, price: 6, solid: false, top: true, colors: 'pastel', pet: 'eat', use: 'feed', shelf: 'petstuff' },
  fountain: { name: 'Water fountain', w: 1, h: 1, price: 19, solid: false, top: true, pet: 'eat', shelf: 'petstuff' },
  toyMouse: { name: 'Toy mouse', w: 1, h: 1, price: 4, solid: false, top: true, pet: 'chase', shelf: 'petstuff' },
  chewBone: { name: 'Chew bone', w: 1, h: 1, price: 5, solid: false, top: true, pet: 'chase', shelf: 'petstuff' },
  petTunnel: { name: 'Pet tunnel', w: 2, h: 1, price: 25, solid: true, colors: 'pastel', pet: 'chase', shelf: 'petstuff' },
  petStairs: { name: 'Pet stairs', w: 1, h: 1, price: 25, solid: true, colors: 'pastel', pet: 'perch', shelf: 'petstuff' },
  sandbox: { name: 'Sandbox', w: 1, h: 1, price: 19, solid: true, pet: 'chase', shelf: 'petstuff' },
  treatJar: { name: 'Treat jar', w: 1, h: 1, price: 6, solid: false, top: true, pet: 'eat', shelf: 'petstuff' },
  petBasket: { name: 'Pet basket', w: 1, h: 1, price: 25, solid: true, colors: 'pastel', pet: 'sleep', shelf: 'petstuff' },
  petHammock: { name: 'Pet hammock', w: 1, h: 1, price: 25, solid: true, colors: 'pastel', pet: 'sleep', shelf: 'petstuff' },
  agility: { name: 'Agility hurdle', w: 1, h: 1, price: 15, solid: true, pet: 'chase', shelf: 'petstuff' },
  ghost: { name: 'Friendly ghost', w: 1, h: 1, price: 25, solid: true, use: 'admire', shelf: 'seasonal' },
  cauldron: { name: 'Bubbling cauldron', w: 1, h: 1, price: 35, solid: true, use: 'cook', shelf: 'seasonal' },
  tombstone: { name: 'Spooky tombstone', w: 1, h: 1, price: 19, solid: true, use: 'admire', shelf: 'seasonal' },
  scarecrow: { name: 'Scarecrow', w: 1, h: 1, price: 30, solid: true, use: 'admire', shelf: 'seasonal' },
  candyBowl: { name: 'Candy bowl', w: 1, h: 1, price: 8, solid: false, top: true, shelf: 'seasonal' },
  gingerbread: { name: 'Gingerbread house', w: 1, h: 1, price: 15, solid: false, top: true, shelf: 'seasonal' },
  menorah: { name: 'Menorah', w: 1, h: 1, price: 19, solid: false, top: true, shelf: 'seasonal' },
  snowflakeLamp: { name: 'Snowflake lamp', w: 1, h: 1, price: 30, solid: true, use: 'admire', shelf: 'seasonal' },
  eggBasket: { name: 'Egg basket', w: 1, h: 1, price: 9, solid: false, top: true, shelf: 'seasonal' },
  heartBalloon: { name: 'Heart balloons', w: 1, h: 1, price: 11, solid: true, use: 'admire', shelf: 'seasonal' },
  clover: { name: 'Lucky clover', w: 1, h: 1, price: 11, solid: true, use: 'water', shelf: 'seasonal' },
  partyBalloons: { name: 'Party balloons', w: 1, h: 1, price: 11, solid: true, use: 'admire', shelf: 'seasonal' },
  lanternString: { name: 'Lantern string', w: 1, h: 1, price: 25, solid: true, use: 'admire', shelf: 'seasonal' },
  diya: { name: 'Diya lamp', w: 1, h: 1, price: 6, solid: false, top: true, shelf: 'seasonal' },
  sleigh: { name: 'Sleigh', w: 2, h: 1, price: 115, solid: true, colors: 'pastel', act: 'sit', shelf: 'seasonal' },
  reindeer: { name: 'Reindeer plush', w: 1, h: 1, price: 35, solid: true, use: 'hug', shelf: 'seasonal' },
  // festivals (see EVENTS below for when each can be bought)
  rangoli: { name: 'Rangoli', w: 2, h: 2, price: 20, solid: false, shelf: 'seasonal' },
  skyLantern: { name: 'Akash kandil', w: 1, h: 1, price: 25, solid: true, use: 'admire', shelf: 'seasonal' },
  mithaiBox: { name: 'Mithai box', w: 1, h: 1, price: 9, solid: false, top: true, shelf: 'seasonal' },
  sparklers: { name: 'Sparkler bucket', w: 1, h: 1, price: 11, solid: true, use: 'admire', shelf: 'seasonal' },
  gulal: { name: 'Gulal colours', w: 1, h: 1, price: 8, solid: false, top: true, shelf: 'seasonal' },
  colourRug: { name: 'Holi splash rug', w: 2, h: 1, price: 15, solid: false, shelf: 'seasonal' },
  dandiya: { name: 'Dandiya sticks', w: 1, h: 1, price: 8, solid: false, top: true, shelf: 'seasonal' },
  garbaLamp: { name: 'Garba pot lamp', w: 1, h: 1, price: 19, solid: true, use: 'dance', shelf: 'seasonal' },
  marigold: { name: 'Marigold toran', w: 1, h: 1, price: 15, solid: true, use: 'admire', shelf: 'seasonal' },
  modak: { name: 'Modak plate', w: 1, h: 1, price: 8, solid: false, top: true, shelf: 'seasonal' },
  kite: { name: 'Patang kite', w: 1, h: 1, price: 11, solid: true, colors: 'pastel', use: 'play', shelf: 'seasonal' },
  pongalPot: { name: 'Pongal pot', w: 1, h: 1, price: 15, solid: true, use: 'cook', shelf: 'seasonal' },
  bonfire: { name: 'Lohri bonfire', w: 1, h: 1, price: 25, solid: true, use: 'warm', shelf: 'seasonal' },
  pookalam: { name: 'Pookalam', w: 2, h: 2, price: 20, solid: false, shelf: 'seasonal' },
  dhol: { name: 'Dhol', w: 1, h: 1, price: 30, solid: true, use: 'drum', shelf: 'seasonal' },
  rakhiThali: { name: 'Rakhi thali', w: 1, h: 1, price: 9, solid: false, top: true, shelf: 'seasonal' },
  dahiHandi: { name: 'Dahi handi', w: 1, h: 1, price: 19, solid: true, use: 'admire', shelf: 'seasonal' },
  indianFlag: { name: 'Tiranga flag', w: 1, h: 1, price: 15, solid: true, use: 'admire', shelf: 'seasonal' },
  tricolourBalloons: { name: 'Tricolour balloons', w: 1, h: 1, price: 11, solid: true, use: 'admire', shelf: 'seasonal' },
  eidLantern: { name: 'Fanoos lantern', w: 1, h: 1, price: 25, solid: true, use: 'admire', shelf: 'seasonal' },
  crescentLamp: { name: 'Crescent moon lamp', w: 1, h: 1, price: 30, solid: true, use: 'admire', shelf: 'seasonal' },
  datesPlate: { name: 'Plate of dates', w: 1, h: 1, price: 6, solid: false, top: true, shelf: 'seasonal' },
  sheerKhurma: { name: 'Sheer khurma', w: 1, h: 1, price: 8, solid: false, top: true, shelf: 'seasonal' },
  prayerMat: { name: 'Prayer mat', w: 1, h: 2, price: 15, solid: false, shelf: 'seasonal' },
  greenBunting: { name: 'Green bunting', w: 1, h: 1, price: 11, solid: true, use: 'admire', shelf: 'seasonal' },
  biryaniPot: { name: 'Biryani handi', w: 1, h: 1, price: 11, solid: false, top: true, shelf: 'seasonal' },
  stocking: { name: 'Christmas stocking', w: 1, h: 1, price: 8, solid: false, top: true, colors: 'pastel', shelf: 'seasonal' },
  wreath: { name: 'Wreath', w: 1, h: 1, price: 19, solid: true, use: 'admire', shelf: 'seasonal' },
  candyCane: { name: 'Giant candy cane', w: 1, h: 1, price: 15, solid: true, use: 'admire', shelf: 'seasonal' },
  batGarland: { name: 'Bat garland', w: 1, h: 1, price: 11, solid: true, use: 'admire', shelf: 'seasonal' },
  witchHat: { name: 'Witch hat', w: 1, h: 1, price: 8, solid: false, top: true, shelf: 'seasonal' },
  easterBunny: { name: 'Easter bunny', w: 1, h: 1, price: 25, solid: true, use: 'hug', shelf: 'seasonal' },
  easterLilies: { name: 'Easter lilies', w: 1, h: 1, price: 14, solid: true, use: 'water', shelf: 'seasonal' },
  hotCrossBuns: { name: 'Hot cross buns', w: 1, h: 1, price: 8, solid: false, top: true, shelf: 'seasonal' },
  lotusLamp: { name: 'Lotus lamp', w: 1, h: 1, price: 11, solid: false, top: true, shelf: 'seasonal' },
  deskCalendar: { name: 'Desk calendar', w: 1, h: 1, price: 9, solid: false, top: true, shelf: 'decor' },
};
// Shop shelves in order. Items list their shelf; items with no shelf (the starter desk and chair, retired bathroom pieces) aren't sold.
export const SHELVES = [
  { id: 'cozy', label: 'Seating' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'living', label: 'Living room' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'plants', label: 'Plants' },
  { id: 'decor', label: 'Decor' },
  { id: 'work', label: 'Workspace' },
  { id: 'fun', label: 'Hobbies' },
  { id: 'games', label: 'Games' },
  { id: 'fitness', label: 'Fitness' },
  { id: 'petstuff', label: 'Pet corner' },
  { id: 'seasonal', label: 'Seasonal' },
];
const FIRST_ITEMS = {
  cozy: ['beanbag', 'armchair', 'sofa', 'floorCushion', 'barStool'],
  bedroom: ['bed', 'nightstand', 'dresser', 'wardrobe', 'clothesRack', 'mirror'],
  living: ['tv', 'fireplace', 'coffeeTable', 'sideTable', 'bookshelf', 'standingFan', 'grandClock'],
  kitchen: ['counter', 'stove', 'sink', 'fridge', 'diningTable', 'microwave', 'teapot', 'fruitBowl', 'cake'],
  plants: ['cactus', 'plant', 'sunflower', 'bonsai', 'palm', 'tulips', 'fig', 'terrarium', 'succulent'],
  decor: ['books', 'lamp', 'globe', 'rug', 'roundRug', 'plush', 'easel'],
  work: ['gamingDesk', 'pcDesk', 'workTable', 'gamingChair', 'officeChair', 'miniFridge', 'coffee', 'energyCan', 'soda', 'wine'],
  fun: ['recordPlayer', 'guitar', 'piano', 'synth', 'drumKit', 'djDeck', 'speaker', 'aquarium', 'telescope'],
  games: ['arcade', 'gameConsole', 'poolTable', 'foosball', 'trampoline'],
  fitness: ['gymBall', 'dumbbells', 'punchingBag', 'exerciseBike', 'treadmill'],
  petstuff: ['catTower', 'doghouse', 'petBed', 'petBall'],
  seasonal: ['pumpkin', 'christmasTree', 'snowman'],
};
for (const [shelf, keys] of Object.entries(FIRST_ITEMS)) for (const k of keys) ITEMS[k].shelf = shelf;
ITEMS.giftBox.shelf = 'decor'; // sending gifts works all year, so the box is always for sale

// Festivals: from `before` days ahead to `after` days after the main day, the festival's items lead the Seasonal shelf
// (everything stays for sale all year). date: 'MM-DD' every year, 'easter' (worked out), or
// per-year dates for festivals that follow the moon. Those are best-known dates and can be a day off (Eid depends on
// the moon sighting): check them, and add next year's before it starts.
export const EVENTS = [
  { id: 'newyear', name: 'New Year', emoji: '🎉', date: '01-01', before: 5, after: 1, items: ['partyBalloons', 'sparklers'] },
  { id: 'sankranti', name: 'Lohri, Makar Sankranti & Pongal', emoji: '🪁', date: '01-14', before: 4, after: 3, items: ['kite', 'bonfire', 'pongalPot'] },
  { id: 'republic', name: 'Republic Day', emoji: '🇮🇳', date: '01-26', before: 3, after: 1, items: ['indianFlag', 'tricolourBalloons'] },
  { id: 'valentine', name: "Valentine's Day", emoji: '💝', date: '02-14', before: 7, after: 1, items: ['heartBalloon'] },
  { id: 'holi', name: 'Holi', emoji: '🎨', date: { 2026: '03-04', 2027: '03-22' }, before: 7, after: 2, items: ['gulal', 'colourRug'] },
  { id: 'stpatrick', name: "St Patrick's Day", emoji: '☘️', date: '03-17', before: 5, after: 1, items: ['clover'] },
  // The whole of Ramadan, then Eid al-Fitr.
  { id: 'eid', name: 'Ramadan & Eid al-Fitr', emoji: '🌙', date: { 2026: '03-20', 2027: '03-10' }, before: 30, after: 3, items: ['eidLantern', 'crescentLamp', 'datesPlate', 'sheerKhurma', 'prayerMat', 'lanternString'] },
  { id: 'easter', name: 'Good Friday & Easter', emoji: '🐣', date: 'easter', before: 10, after: 2, items: ['eggBasket', 'easterBunny', 'easterLilies', 'hotCrossBuns'] },
  { id: 'baisakhi', name: 'Baisakhi & Bihu', emoji: '🌾', date: '04-14', before: 4, after: 3, items: ['dhol', 'marigold'] },
  { id: 'buddha', name: 'Buddha Purnima', emoji: '🪷', date: { 2026: '05-01', 2027: '05-20' }, before: 4, after: 2, items: ['lotusLamp', 'diya'] },
  { id: 'eidadha', name: 'Eid al-Adha', emoji: '🌙', date: { 2026: '05-27', 2027: '05-17' }, before: 5, after: 3, items: ['eidLantern', 'crescentLamp', 'biryaniPot', 'prayerMat'] },
  { id: 'independence', name: 'Independence Day', emoji: '🇮🇳', date: '08-15', before: 4, after: 1, items: ['indianFlag', 'tricolourBalloons', 'kite'] },
  { id: 'onam', name: 'Onam', emoji: '🌼', date: { 2026: '08-26', 2027: '09-12' }, before: 9, after: 2, items: ['pookalam', 'marigold'] },
  { id: 'rakhi', name: 'Raksha Bandhan', emoji: '🧵', date: { 2026: '08-28', 2027: '08-17' }, before: 5, after: 1, items: ['rakhiThali', 'mithaiBox'] },
  { id: 'milad', name: 'Milad-un-Nabi', emoji: '🕌', date: { 2026: '08-26', 2027: '08-15' }, before: 4, after: 2, items: ['greenBunting', 'crescentLamp', 'lanternString'] },
  { id: 'janmashtami', name: 'Janmashtami', emoji: '🪈', date: { 2026: '09-04', 2027: '08-25' }, before: 4, after: 1, items: ['dahiHandi', 'mithaiBox'] },
  { id: 'ganesh', name: 'Ganesh Chaturthi', emoji: '🐘', date: { 2026: '09-14', 2027: '09-04' }, before: 4, after: 10, items: ['modak', 'marigold', 'dhol'] },
  // Navratri's nine nights run up to Dussehra, alongside Durga Puja.
  { id: 'navratri', name: 'Navratri, Durga Puja & Dussehra', emoji: '🪔', date: { 2026: '10-20', 2027: '10-09' }, before: 11, after: 2, items: ['dandiya', 'garbaLamp', 'marigold', 'dhol'] },
  { id: 'halloween', name: 'Halloween', emoji: '🎃', date: '10-31', before: 14, after: 2, items: ['pumpkin', 'ghost', 'cauldron', 'tombstone', 'candyBowl', 'scarecrow', 'batGarland', 'witchHat'] },
  { id: 'diwali', name: 'Diwali', emoji: '🪔', date: { 2026: '11-08', 2027: '10-29' }, before: 10, after: 3, items: ['diya', 'rangoli', 'skyLantern', 'mithaiBox', 'sparklers', 'lanternString', 'marigold'] },
  { id: 'gurpurab', name: 'Guru Nanak Jayanti', emoji: '🕯️', date: { 2026: '11-24', 2027: '11-14' }, before: 4, after: 1, items: ['diya', 'candles', 'lanternString'] },
  { id: 'hanukkah', name: 'Hanukkah', emoji: '🕎', date: { 2026: '12-04', 2027: '12-24' }, before: 3, after: 8, items: ['menorah'] },
  { id: 'christmas', name: 'Christmas', emoji: '🎄', date: '12-25', before: 24, after: 6, items: ['christmasTree', 'snowman', 'sleigh', 'reindeer', 'gingerbread', 'snowflakeLamp', 'stocking', 'wreath', 'candyCane'] },
];

const DAY = 86_400_000;
// Easter Sunday (Gregorian calendar, anonymous algorithm).
export function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return new Date(y, Math.floor(n / 31) - 1, (n % 31) + 1);
}
function mainDay(ev, y) {
  if (ev.date === 'easter') return easterSunday(y);
  const md = typeof ev.date === 'string' ? ev.date : ev.date[y];
  if (!md) return null;
  const [m, d] = md.split('-').map(Number);
  return new Date(y, m - 1, d);
}
// Each festival's next window that hasn't ended yet (windows can cross New Year), soonest first.
function windows(now) {
  const out = [];
  for (const ev of EVENTS) for (const y of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
    const day = mainDay(ev, y);
    if (!day) continue;
    const from = new Date(+day - ev.before * DAY), ends = new Date(+day + (ev.after + 1) * DAY);
    if (ends > now) { out.push({ ...ev, day, from, ends }); break; }
  }
  return out.sort((a, b) => a.from - b.from);
}
export const activeEvents = (now = new Date()) => windows(now).filter((e) => e.from <= now);
export const nextEvent = (now = new Date()) => windows(now).find((e) => e.from > now) ?? null;
export const USES = [...new Set(Object.values(ITEMS).map((i) => i.use).filter(Boolean))];
export const PASTELS = ['#f4a6b8', '#9db4ee', '#8fd0a8', '#ffd27a', '#b89af0', '#f2b48a', '#e8e3dc', '#7a6a8a'];
export const WOODS = ['#d9a06a', '#b07a4e', '#8a5a3c', '#f0d2a8', '#fffaf3', '#9db4ee'];
export const colorsFor = (item) => ({ pastel: PASTELS, wood: WOODS })[ITEMS[item]?.colors] ?? [];

// Pets cost a lot on purpose: at 1 coin per focused minute they take real study time to earn.
// coats: fur colours the owner can switch between for free (the first is the default).
export const PETS = {
  hamster: { name: 'Hamster', price: 300, coats: ['#f2c48a', '#fff0dc', '#c8a08a', '#b8b0c0'] },
  duckling: { name: 'Duckling', price: 350, coats: ['#ffe07a', '#fffaf3', '#c8e0a0'] },
  frog: { name: 'Frog', price: 400, coats: ['#8fd0a8', '#f7b6c8', '#9db4ee', '#ffd27a'] },
  piglet: { name: 'Piglet', price: 420, coats: ['#f7c0c8', '#f2b48a', '#e8d8d0'] },
  sheep: { name: 'Lamb', price: 450, coats: ['#fffaf3', '#e8d8f0', '#f2c4d0', '#6a6070'] },
  turtle: { name: 'Turtle', price: 480, coats: ['#8fb070', '#d9a06a', '#7fb2e8', '#b89af0'] },
  bunny: { name: 'Bunny', price: 500, coats: ['#fff4ea', '#d9a87a', '#b8b0c0', '#f2c4d0'] },
  hedgehog: { name: 'Hedgehog', price: 550, coats: ['#a8805e', '#e8d8c8', '#8a7a8e'] },
  penguin: { name: 'Penguin', price: 600, coats: ['#4a5878', '#6a6a7a', '#7a9ac8'] },
  cat: { name: 'Cat', price: 650, coats: ['#f2a65a', '#b8b0c0', '#5a5060', '#fff0dc', '#d9a87a'] },
  puppy: { name: 'Puppy', price: 750, coats: ['#c89068', '#f2c46a', '#fff4ea', '#6a5a5a'] },
  capybara: { name: 'Capybara', price: 800, coats: ['#c8966a', '#a87a58', '#d9b48a'] },
  koala: { name: 'Koala', price: 700, coats: ['#a8a0b8', '#c8b8a8', '#8a8a9a'] },
  owl: { name: 'Owl', price: 850, coats: ['#b08a68', '#e8e3dc', '#8a7a9a'] },
  panda: { name: 'Panda', price: 900, coats: ['#fffaf3', '#f2b48a'] },
  raccoon: { name: 'Raccoon', price: 880, coats: ['#a8a0b8', '#c8a888', '#8a7a7a'] },
  fox: { name: 'Fox', price: 950, coats: ['#f28a3a', '#e8ecf4', '#9a98a8'] },
  axolotl: { name: 'Axolotl', price: 1300, coats: ['#f7b6c8', '#9db4ee', '#ffd27a', '#b89af0'] },
  unicorn: { name: 'Unicorn', price: 1800, coats: ['#fffaf3', '#f2c4d0', '#cfe1f7', '#e8d8f0'] },
  dragon: { name: 'Baby dragon', price: 2000, coats: ['#8fd0a8', '#b89af0', '#f48a8a', '#7fb2e8'] },
};
// Things pets can wear. Bought once, then put on any of your pets for free.
export const PET_ACCS = {
  bow: { name: 'Bow', price: 40 },
  bell: { name: 'Bell collar', price: 40 },
  bandana: { name: 'Bandana', price: 50 },
  flowers: { name: 'Flower crown', price: 60 },
  beanie: { name: 'Beanie', price: 60 },
  glasses: { name: 'Heart glasses', price: 70 },
  partyHat: { name: 'Party hat', price: 80 },
  crown: { name: 'Crown', price: 150 },
  scarf: { name: 'Cozy scarf', price: 45 },
  shades: { name: 'Cool shades', price: 70 },
  cap: { name: 'Ball cap', price: 50 },
  topHat: { name: 'Top hat', price: 90 },
  witchHat: { name: 'Witch hat', price: 80 },
  halo: { name: 'Halo', price: 120 },
  santaHat: { name: 'Santa hat', price: 70 },
  headphones: { name: 'Headphones', price: 85 },
  bunnyEars: { name: 'Bunny ears', price: 55 },
  starClip: { name: 'Star clip', price: 30 },
  flower: { name: 'Flower', price: 30 },
  cape: { name: 'Hero cape', price: 100 },
};
export const MAX_PETS = 4;

export const WALLPAPERS = ['#f6dcc0', '#cfe8d8', '#ddd5f5', '#fbd0d4', '#cfe1f7', '#f8edc0', '#fffaf3', '#e8d3c0', '#c9e4ef', '#e6d0ea'];
export const WALL_PATTERNS = ['plain', 'stripes', 'dots', 'hearts', 'checks', 'stars'];
export const FLOORS = ['#c8935f', '#b07a58', '#e0b382', '#9fae86', '#b3a2c9', '#d8a0a0', '#e8e3dc', '#8a7a8e', '#a8c4d8', '#d9b48a'];
export const FLOOR_STYLES = ['planks', 'tiles', 'carpet', 'herringbone'];
export const SKINS = ['#ffe0c8', '#f5c9a5', '#d9a07a', '#a8714f', '#6e4630'];
export const HAIRS = ['#3a2a35', '#7a4a32', '#f2c46a', '#e8735a', '#8a7ad8', '#f4b6c8', '#7ec8c0'];
export const SHIRTS = ['#f48a8a', '#7fb2e8', '#8fd0a8', '#ffd27a', '#b89af0', '#f4b6d0'];
export const STYLES = ['short', 'side part', 'buzz', 'spiky', 'curly', 'bob', 'long', 'ponytail', 'buns', 'messy', 'undercut', 'quiff', 'fauxhawk', 'topknot', 'slick', 'curtains', 'crop', 'mohawk', 'afro'];
export const FACES = ['happy', 'sleepy', 'wink', 'grin', 'cool', 'surprised', 'blush', 'smirk', 'fierce', 'silly'];
export const OUTFITS = ['tee', 'tie', 'sweater', 'jacket', 'hoodie', 'overalls', 'dress', 'skirt', 'striped', 'vest', 'tank', 'kimono', 'polo', 'suit', 'cardigan', 'apron', 'raincoat', 'sailor', 'hawaiian', 'puffer'];

export const FOCUS_LENGTHS = [15, 25, 45, 60];

// Room upgrades: each level makes the floor bigger. EXPAND_COST[n] is the price to reach level n.
export const ROOM_SIZES = [{ w: 10, h: 8 }, { w: 12, h: 9 }, { w: 14, h: 10 }, { w: 16, h: 11 }];
export const EXPAND_COST = [0, 250, 600, 1200];

// Plants want watering every few days, or they droop (looks only, nothing is lost).
export const THIRSTY_MS = 3 * 86_400_000;
export const isPlant = (item) => ITEMS[item]?.use === 'water';
// "Everyone" house to-dos: finishing one gives each person coins and money off their next shop buy, a few times a day.
export const TASK_COINS = 5, TASK_REWARDS_PER_DAY = 3;
export const discounted = (price, discount) => (discount ? Math.ceil(price * 0.9) : price);
// Gifts between housemates: a fixed amount, a few a day, so coins can't be shovelled between accounts.
export const GIFT_COINS = 10, GIFTS_PER_DAY = 5;
// Extra rooms: everyone starts with one; ROOM_COST[n] buys room number n + 1.
export const MAX_ROOMS = 3;
export const ROOM_COST = [0, 1500, 2500];
export const roomSize = (room) => ROOM_SIZES[room?.level ?? 0] ?? ROOM_SIZES[0];

// Cell kinds
export const VOID = 0, FLOOR = 1, WALL = 2, BLOCKED = 3, DOOR = 4;

// rooms: [{ level?, furniture: [{ item, x, y }] }] in house order, filling each row of the square grid first.
// Rooms pack side by side by their real size, colsFor(n) per row, sharing one wall. That shared wall opens up almost floor to floor so neighbours read as one
// big space; a tile of wall stays at each end of the opening (and the back wall) so each room keeps its look.
// Rows link with a 2-tile doorway, so back walls (windows, wallpaper) stay whole.
export function buildGrid(rooms) {
  const sizes = rooms.map(roomSize);
  const origins = [];
  const COLS = colsFor(rooms.length);
  let rowY = WALL_H;
  for (let start = 0; start < rooms.length; start += COLS) {
    let x = 1, rowH = 0;
    for (let i = start; i < Math.min(rooms.length, start + COLS); i++) {
      origins[i] = { x, y: rowY };
      x += sizes[i].w + 1;
      rowH = Math.max(rowH, sizes[i].h);
    }
    rowY += rowH + 1 + WALL_H;
  }
  const w = Math.max(ROOM_W + 2, ...origins.map((o, i) => o.x + sizes[i].w + 1));
  const h = Math.max(ROOM_H + WALL_H + 1, ...origins.map((o, i) => o.y + sizes[i].h + 1));
  const cell = new Uint8Array(w * h);
  const owner = new Int16Array(w * h).fill(-1);
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const set = (x, y, v) => { if (inside(x, y)) cell[y * w + x] = v; };
  const wallIfVoid = (x, y) => { if (inside(x, y) && cell[y * w + x] === VOID) cell[y * w + x] = WALL; };

  rooms.forEach((_, i) => {
    const o = origins[i], s = sizes[i];
    for (let y = o.y - WALL_H; y <= o.y + s.h; y++) {
      for (let x = o.x - 1; x <= o.x + s.w; x++) {
        if (x >= o.x && x < o.x + s.w && y >= o.y && y < o.y + s.h) { set(x, y, FLOOR); owner[y * w + x] = i; }
        else set(x, y, WALL);
      }
    }
  });
  rooms.forEach((_, i) => {
    const o = origins[i], s = sizes[i];
    if (i % COLS < COLS - 1 && i + 1 < rooms.length) {
      // Open the shared wall between side-by-side rooms, leaving a post at the top and bottom.
      const X = o.x + s.w, rows = Math.min(s.h, sizes[i + 1].h);
      for (let y = o.y + 1; y < o.y + rows - 1; y++) set(X, y, DOOR);
    }
    if (i + COLS < rooms.length) {
      // Doorway down to the room below, through wherever their floors overlap.
      const b = origins[i + COLS], bs = sizes[i + COLS];
      const lo = Math.max(o.x, b.x), hi = Math.min(o.x + s.w, b.x + bs.w);
      if (hi - lo >= 4) {
        const dx = lo + (hi - lo >= 8 ? 4 : 1);
        for (let y = o.y + s.h; y < b.y; y++) {
          set(dx, y, DOOR); set(dx + 1, y, DOOR);
          wallIfVoid(dx - 1, y); wallIfVoid(dx + 2, y);
        }
      }
    }
  });
  rooms.forEach((room, i) => {
    const o = origins[i];
    for (const f of room.furniture) {
      const it = ITEMS[f.item];
      if (!it?.solid) continue;
      const d = footprint(f);
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) set(o.x + f.x + x, o.y + f.y + y, BLOCKED);
    }
  });
  return { w, h, cols: COLS, cell, owner, origins, sizes, at: (x, y) => (inside(x, y) ? cell[y * w + x] : VOID) };
}

export const walkable = (k) => k === FLOOR || k === DOOR;

// Turning: rot 0 faces front, 1 and 3 sideways, 2 away. Sideways a piece's width and depth swap.
export const footprint = (f) => { const it = ITEMS[f.item]; return f.rot % 2 ? { w: it.h, h: it.w } : { w: it.w, h: it.h }; };
// Rugs, mats and beds are seen from above, so they turn as a whole picture; upright things show a side or their back.
export const lying = (it) => (!it.solid && !it.top) || it.h > it.w;
// The next way a piece can face. Square upright things only have a front and a back (their side looks like their front).
export const nextRot = (f) => {
  const it = ITEMS[f.item], r = f.rot ?? 0;
  return it.w === it.h && !lying(it) ? (r ? 0 : 2) : (r + 1) % 4;
};

// Room-local placement check. Each layer only collides with itself: rugs, solid furniture, small tabletop things.
const layer = (it) => (it.top ? 2 : it.solid ? 1 : 0);
export function canPlace(room, item, x, y, rot = 0) {
  const it = ITEMS[item];
  const s = roomSize(room);
  if (!it || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  const d = footprint({ item, rot });
  if (x < 0 || y < 0 || x + d.w > s.w || y + d.h > s.h) return false;
  return !room.furniture.some((f) => hits(f, it, x, y, d));
}
const hits = (f, it, x, y, d) => {
  const o = ITEMS[f.item], fd = o && footprint(f);
  return o && layer(o) === layer(it) && x < f.x + fd.w && f.x < x + d.w && y < f.y + fd.h && f.y < y + d.h;
};

// Workspace pieces swap out the same kind of piece in their spot (desk for desk, chair for chair, drink for laptop)
// instead of being blocked by it. Returns the indexes to send back to storage, or null if it can't go there.
const swapKind = (it) => (it?.table ? 'table' : it?.chair ? 'chair' : it?.top && it.shelf === 'work' ? 'top' : null);
export function placeSwaps(room, item, x, y) {
  const it = ITEMS[item], k = swapKind(it);
  const out = k ? room.furniture.flatMap((f, i) => (swapKind(ITEMS[f.item]) === k && hits(f, it, x, y, footprint({ item })) ? [i] : [])) : [];
  return canPlace({ ...room, furniture: room.furniture.filter((_, i) => !out.includes(i)) }, item, x, y) ? out : null;
}

export function focusReward(minutes, withFriends) {
  return minutes + (withFriends ? Math.ceil(minutes * 0.25) : 0);
}
