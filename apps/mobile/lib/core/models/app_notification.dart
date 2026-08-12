/// GET /members/:id/notifications. Named AppNotification, not
/// Notification — Flutter's own framework already owns that name.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.message,
    required this.readAt,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
        id: json['id'] as String,
        type: json['type'] as String,
        message: json['message'] as String,
        readAt: json['readAt'] == null ? null : DateTime.parse(json['readAt'] as String),
        createdAt: DateTime.parse(json['createdAt'] as String),
      );

  final String id;
  final String type;
  final String message;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get isUnread => readAt == null;
}
