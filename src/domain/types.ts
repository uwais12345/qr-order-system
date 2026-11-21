export type SubscriptionPlan = 'Basic' | 'Professional' | 'Enterprise';
export type BillingCycle = 'Monthly' | 'Annual';
export type SubscriptionStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRING SOON' | 'SUSPENDED';
export type SubscriptionPaymentStatus = 'Paid' | 'Pending' | 'Overdue';
export type RestaurantStatus = 'Active' | 'Inactive' | 'Setup Pending' | 'Suspended';

export type TableStatus = 'Available' | 'Occupied' | 'Reserved';

export type OrderStatus =
  | 'Pending'
  | 'Accepted'
  | 'Preparing'
  | 'Ready'
  | 'Served'
  | 'Completed'
  | 'Cancelled';

export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Online Payment';
export type OrderCheckoutPaymentMethod = 'Online Payment' | 'Pay at Restaurant';
export type PaymentStatus = 'Pending' | 'Partially Paid' | 'Paid' | 'Refunded';

export type FieldRequirement = 'Optional' | 'Mandatory';

export interface SubscriptionInvoice {
  id: string;
  date: string;
  description: string;
  amountInr: number;
  billingCycle: BillingCycle;
  status: SubscriptionPaymentStatus;
}

export interface Branch {
  id: string;
  restaurantId: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  isMain: boolean;
}

export interface CustomerVerificationSettings {
  guestOrderingEnabled: boolean;
  customerNameRequirement: FieldRequirement;
  mobileNumberRequirement: FieldRequirement;
  otpVerificationEnabled: boolean;
  waiterApprovalRequired: boolean;
}

export interface RestaurantSettings {
  operatingHours: string;
  taxRatePercent: number;
  taxLabel: string;
  currencySymbol: string;
  currencyCode: string;
  autoAcceptOrders: boolean;
  estimatedPrepBufferMin: number;
  welcomeMessage: string;
  payAtRestaurantEnabled: boolean;
  customerSettings: CustomerVerificationSettings;
}

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  logoText: string;
  logoColor: string;
  logoImageUrl?: string;
  businessType: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  subscriptionPlan: SubscriptionPlan;
  billingCycle: BillingCycle;
  subscriptionStartDate: string;
  subscriptionExpiryDate: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPaymentStatus: SubscriptionPaymentStatus;
  monthlyPriceInr: number;
  customMonthlyPriceInr: number;
  customAnnualPriceInr: number;
  hasCustomPricing?: boolean;
  subscriptionBillingHistory: SubscriptionInvoice[];
  status: RestaurantStatus;
  registeredAt: string;
  inviteToken: string;
  inviteSetupCompleted: boolean;
  mustChangePassword?: boolean;
  emailVerified?: boolean;
  branches: Branch[];
  settings: RestaurantSettings;
}

export interface CustomizationChoice {
  id: string;
  label: string;
  priceDelta: number;
}

export interface CustomizationGroup {
  id: string;
  name: string;
  type: 'single' | 'multiple';
  required: boolean;
  choices: CustomizationChoice[];
}

export interface MenuItem {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  category: string;
  isVeg: boolean;
  available: boolean;
  prepTimeMinutes: number;
  customizations: CustomizationGroup[];
}

export interface DiningTable {
  id: string;
  restaurantId: string;
  branchId: string;
  tableNumber: string;
  section: string;
  capacity: number;
  status: TableStatus;
  qrVersion: number;
  qrGeneratedAt: string;
}

export interface SelectedCustomization {
  groupId: string;
  groupName: string;
  choiceId: string;
  choiceLabel: string;
  priceDelta: number;
}

export interface CartItem {
  cartItemId: string;
  menuItemId: string;
  name: string;
  imageUrl: string;
  basePrice: number;
  isVeg: boolean;
  prepTimeMinutes: number;
  quantity: number;
  selectedCustomizations: SelectedCustomization[];
  specialInstructions: string;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  basePrice: number;
  unitPrice: number;
  quantity: number;
  isVeg: boolean;
  selectedCustomizations: SelectedCustomization[];
  specialInstructions: string;
}

export interface Order {
  id: string;
  restaurantId: string;
  branchId: string;
  tableId: string;
  tableNumber: string;
  customerSessionId: string;
  customerName?: string;
  customerPhone?: string;
  otpVerified?: boolean;
  items: OrderItem[];
  subtotal: number;
  taxRatePercent: number;
  taxAmount: number;
  totalAmount: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  orderPaymentMethod?: OrderCheckoutPaymentMethod;
  onlinePaymentRef?: string;
  billId?: string;
  estimatedPrepMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface Bill {
  id: string;
  receiptNumber: string;
  restaurantId: string;
  branchId: string;
  tableNumber: string;
  mode: 'individual' | 'combined';
  orderIds: string[];
  customerSummary: string;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxRatePercent: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  createdAt: string;
}

export interface PlatformActivity {
  id: string;
  timestamp: string;
  restaurantName: string;
  action: string;
  detail: string;
}

export interface SubscriptionPlanConfig {
  name: SubscriptionPlan;
  audience: string;
  monthlyPriceInr: number;
  annualPriceInr: number;
  maxBranches: number;
  maxTables: number;
  features: string[];
}

export interface ServeQRState {
  planCatalog: SubscriptionPlanConfig[];
  restaurants: Restaurant[];
  categoriesByRestaurant: Record<string, string[]>;
  menuItems: MenuItem[];
  tables: DiningTable[];
  orders: Order[];
  bills: Bill[];
  activities: PlatformActivity[];
  nextOrderSeq: number;
  nextRestaurantSeq: number;
  nextBillSeq: number;
}
