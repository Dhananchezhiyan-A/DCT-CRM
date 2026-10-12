export function getBookingAccess(hasPermission: (permissionName: string) => boolean) {
  return {
    canView: hasPermission("BOOKING_READ"),
    canCreate: hasPermission("BOOKING_CREATE"),
    canEdit: hasPermission("BOOKING_UPDATE") || hasPermission("BOOKING_EDIT"),
    canCancel:
      hasPermission("BOOKING_DELETE") ||
      hasPermission("BOOKING_CANCEL") ||
      hasPermission("BOOKING_UPDATE"),
  };
}
