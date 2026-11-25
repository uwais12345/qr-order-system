export const RealtimeRooms = {
  restaurantAdmin: (restaurantId: string) => `restaurant:${restaurantId}:admin`,
  restaurantKitchen: (restaurantId: string) => `restaurant:${restaurantId}:kitchen`,
  branchKitchen: (branchId: string) => `branch:${branchId}:kitchen`,
  guestSession: (guestSessionId: string) => `guest-session:${guestSessionId}`,
  order: (orderId: string) => `order:${orderId}`,
} as const;
