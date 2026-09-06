export const DRIVER_ARRIVAL_RADIUS_METERS = 1_500;

export type DriverArrivalStage = 'pickup' | 'dropoff';

const ALLOWED_STATUSES: Record<DriverArrivalStage, readonly string[]> = {
  pickup: ['confirmed', 'preparing', 'ready', 'assigned'],
  dropoff: ['picked_up', 'delivering'],
};

export function isDriverArrivalStage(value: unknown): value is DriverArrivalStage {
  return value === 'pickup' || value === 'dropoff';
}

export function canMarkDriverArrival(stage: DriverArrivalStage, status: string): boolean {
  return ALLOWED_STATUSES[stage].includes(status);
}

export function arrivalEventType(stage: DriverArrivalStage): 'driver_arrived_pickup' | 'driver_arrived_dropoff' {
  return stage === 'pickup' ? 'driver_arrived_pickup' : 'driver_arrived_dropoff';
}

export function isWithinArrivalRadius(distanceMeters: number | null): boolean {
  return distanceMeters === null || (Number.isFinite(distanceMeters) && distanceMeters <= DRIVER_ARRIVAL_RADIUS_METERS);
}
