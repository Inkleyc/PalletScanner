import type { InventoryItem } from "@palletscanner/core";

export type BundleSuggestion = {
  title: string;
  items: string[];
  price: number;
  reason: string;
};

export type ItemDetailDraft = {
  name: string;
  category: string;
  condition: string;
  quantity: string;
  low: string;
  high: string;
  floor: string;
  listingPrice: string;
  ebayTitle: string;
  ebayDescription: string;
  ebayItemSpecifics: Record<string, string>;
};


export const demoInventorySeed = [
  { id: 910001, name: "KitchenAid Classic Stand Mixer K45SS", category: "Small kitchen appliances", condition: "Used - good", low: 90, high: 145, floor: 75, list: 129.99, platform: "eBay", photo: "https://i.ebayimg.com/images/g/4uUAAeSwKO1psiam/s-l960.jpg", title: "KitchenAid Classic K45SS 4.5 Qt Tilt-Head Stand Mixer White With Bowl", description: "Tested KitchenAid Classic stand mixer with stainless bowl. Normal cosmetic wear from use; see photos for condition and included pieces." },
  { id: 910002, name: "DeWalt DCD785 18V Cordless Drill", category: "Power tools", condition: "Used - fair", low: 45, high: 80, floor: 35, list: 69.99, platform: "eBay", photo: "https://cgxuk.co.uk/media/catalog/product/b/0/b0317aac-82e5-4370-b2dc-e5acfc89e1c8.jpeg?height=600&image-type=image&store=default&width=600", title: "DeWalt DCD785 18V XR Cordless Combi Drill Driver Tool", description: "Pre-owned DeWalt cordless drill with visible cosmetic wear. Confirm battery, charger, and accessories shown in photos before purchase." },
  { id: 910003, name: "Bose QuietComfort Wireless Headphones", category: "Headphones", condition: "Used - good", low: 95, high: 150, floor: 80, list: 139.99, platform: "eBay", photo: "https://i.ebayimg.com/images/g/7LQAAOSwBNNlg5k8/s-l1200.jpg", title: "Bose QuietComfort Wireless Bluetooth Noise Cancelling Headphones Black", description: "Bose QuietComfort over-ear wireless headphones in good working condition with light cosmetic wear. Includes the accessories pictured." },
  { id: 910004, name: "Electrolux ERB30 Robot Vacuum", category: "Vacuum cleaners", condition: "Open box", low: 75, high: 125, floor: 65, list: 109.99, platform: "Facebook", photo: "https://static.wixstatic.com/media/507b47_d7d1b87453c9462db58dfee0dec8c297~mv2.jpg/v1/fill/w_679%2Ch_711%2Cal_c%2Cq_85%2Cenc_avif%2Cquality_auto/507b47_d7d1b87453c9462db58dfee0dec8c297~mv2.jpg", title: "Electrolux ERB30 Robot Vacuum and Mop", description: "Open-box Electrolux robotic vacuum with remote and charging accessories. Inspect photos for package contents and condition." },
  { id: 910005, name: "Kobot RV353 Slim Robot Vacuum", category: "Vacuum cleaners", condition: "New - open box", low: 65, high: 110, floor: 55, list: 99.99, platform: "Facebook", photo: "https://media-www.canadiantire.ca/product/living/cleaning/vacuums-and-floorcare/0438152/kobot-rv353-slim-robotic-vacuum-a2801347-ff51-4d6c-ac57-232f2b0098a1.png?imwidth=1024", title: "Kobot RV353 Slim Robotic Vacuum With Charging Dock", description: "Open-box slim robotic vacuum with charging dock. Includes the pieces shown and is ready for final functional verification." },
  { id: 910006, name: "Samsung VR5000 Robot Vacuum and Mop", category: "Vacuum cleaners", condition: "Used - excellent", low: 115, high: 175, floor: 95, list: 159.99, platform: "eBay", photo: "https://www.galaxus.ch/im/productimages/2/7/1/3/5/3/4/1/5/4/7/5/2/8/6/8/8/2/6/1abccb06-67a7-48c6-a5e2-2453abc039ee_cropped.png", title: "Samsung VR5000 2-in-1 Robot Vacuum and Mop Wi-Fi", description: "Clean Samsung VR5000 robotic vacuum and mop in excellent used condition. Includes charging equipment and accessories pictured." },
  { id: 910007, name: "Bose QuietComfort Headphones With Case", category: "Headphones", condition: "Seller refurbished", low: 110, high: 165, floor: 95, list: 149.99, platform: "eBay", photo: "https://i.ebayimg.com/images/g/IaoAAeSwNKxptCJe/s-l1200.jpg", title: "Bose QuietComfort Wireless Headphones Beige With Case and Charger", description: "Professionally refurbished Bose QuietComfort headphones with carrying case and charging cable. Tested and ready to use." },
];

export const DEMO_INVENTORY_ENABLED =
  process.env.EXPO_PUBLIC_ENABLE_DEMO_INVENTORY === "true";


export const getListedPlatforms = (item: InventoryItem) =>
  Array.isArray(item.listedPlatforms)
    ? item.listedPlatforms.filter(
        (platform): platform is "facebook" | "ebay" =>
          platform === "facebook" || platform === "ebay",
      )
    : [];

export const hasListedPlatform = (item: InventoryItem, platform: "facebook" | "ebay") =>
  getListedPlatforms(item).includes(platform);

export const displayText = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;

export const displayNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && !Number.isNaN(value) ? value : fallback;

export const displayId = (value: unknown) =>
  typeof value === "number" && !Number.isNaN(value)
    ? value
    : typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;

export const displayPhotoUri = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

export const displayQuantity = (value: unknown) =>
  typeof value === "number" && !Number.isNaN(value) && value > 0
    ? Math.floor(value)
    : 1;

export const displaySoldPrice = (value: unknown) =>
  typeof value === "number" && !Number.isNaN(value) ? value : null;
