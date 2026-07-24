/**
 * TypeScript types — تطابق supabase-schema.sql
 * يُستخدم في الـ web/ و mobile/ (مستقبلاً)
 */

export type UserRole = 'customer' | 'driver' | 'restaurant' | 'admin';

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  role: UserRole;
  avatar_url: string | null;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Restaurant {
  id: string;
  owner_id: string | null;
  name: string;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  address: string;
  latitude: number;
  longitude: number;
  cuisine: string[];
  is_verified: boolean;
  is_active: boolean;
  min_order_amount: number;
  delivery_fee: number;
  opening_hours?: Array<{ day: string; is_open: boolean; open_time: string; close_time: string }>;
  estimated_delivery_time: string;
  rating: number;
  review_count: number;
  is_featured?: boolean;
  phone?: string | null;
  updated_at?: string;
}

export interface Product {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  discount_price: number | null;
  image_urls: string[];
  is_available: boolean;
  is_featured: boolean;
  preparation_time: number;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'assigned'
  | 'picked_up'
  | 'delivering'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  restaurant_id: string;
  driver_id: string | null;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  tax: number;
  tip: number;
  discount: number;
  total: number;
  payment_method: 'cash' | 'stripe' | 'wallet';
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  delivery_instructions: string | null;
  delivery_address: Record<string, any>;
  customer_latitude: number | null;
  customer_longitude: number | null;
  driver_latitude: number | null;
  driver_longitude: number | null;
  created_at: string;
  accepted_at: string | null;
  prepared_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  restaurants?: {
    name: string;
    logo_url?: string | null;
    address?: string;
    phone?: string | null;
    latitude?: number;
    longitude?: number;
  };
  customer?: { name: string; phone: string | null };
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_price: number;
  quantity: number;
  subtotal: number;
}

export interface DriverStatus {
  driver_id: string;
  is_online: boolean;
  is_on_delivery: boolean;
  current_order_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'قيد الانتظار',
  confirmed: 'مؤكد',
  preparing: 'قيد التحضير',
  ready: 'جاهز للاستلام',
  assigned: 'تم تعيين سائق',
  picked_up: 'تم الاستلام',
  delivering: 'قيد التوصيل',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
  refunded: 'مسترد',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'badge bg-gray-100 text-gray-800',
  confirmed: 'badge-info',
  preparing: 'badge-warning',
  ready: 'badge-info',
  assigned: 'badge-info',
  picked_up: 'badge-warning',
  delivering: 'badge-warning',
  delivered: 'badge-success',
  cancelled: 'badge-danger',
  refunded: 'badge-danger',
};