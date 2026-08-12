class MemberStatusChange {
  const MemberStatusChange({
    required this.id,
    required this.fromStatus,
    required this.toStatus,
    required this.reason,
    required this.changedAt,
  });

  factory MemberStatusChange.fromJson(Map<String, dynamic> json) => MemberStatusChange(
        id: json['id'] as String,
        fromStatus: json['fromStatus'] as String?,
        toStatus: json['toStatus'] as String,
        reason: json['reason'] as String?,
        changedAt: DateTime.parse(json['changedAt'] as String),
      );

  final String id;
  final String? fromStatus;
  final String toStatus;
  final String? reason;
  final DateTime changedAt;
}
