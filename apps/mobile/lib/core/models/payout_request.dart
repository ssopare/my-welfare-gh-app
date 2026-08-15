class PayoutRecipientModel {
  const PayoutRecipientModel({
    required this.id,
    required this.name,
    required this.type,
    required this.accountNumber,
    required this.bankCode,
    required this.isAllowlisted,
  });

  factory PayoutRecipientModel.fromJson(Map<String, dynamic> json) => PayoutRecipientModel(
        id: json['id'] as String,
        name: json['name'] as String,
        type: json['type'] as String,
        accountNumber: json['accountNumber'] as String,
        bankCode: json['bankCode'] as String,
        isAllowlisted: json['isAllowlisted'] as bool,
      );

  final String id;
  final String name;
  final String type;
  final String accountNumber;
  final String bankCode;
  final bool isAllowlisted;
}

class PayoutApprovalModel {
  const PayoutApprovalModel({
    required this.id,
    required this.decision,
    required this.comment,
    required this.officerId,
    required this.createdAt,
  });

  factory PayoutApprovalModel.fromJson(Map<String, dynamic> json) => PayoutApprovalModel(
        id: json['id'] as String,
        decision: json['decision'] as String,
        comment: json['comment'] as String?,
        officerId: json['officerId'] as String,
        createdAt: json['createdAt'] as String,
      );

  final String id;
  final String decision;
  final String? comment;
  final String officerId;
  final String createdAt;
}

class PayoutRequestModel {
  const PayoutRequestModel({
    required this.id,
    required this.amountValue,
    required this.currency,
    required this.fundId,
    required this.recipientId,
    required this.purpose,
    required this.status,
    required this.requesterId,
    required this.createdAt,
    this.recipient,
    this.approvals,
  });

  factory PayoutRequestModel.fromJson(Map<String, dynamic> json) => PayoutRequestModel(
        id: json['id'] as String,
        amountValue: json['amountValue'] as String,
        currency: json['currency'] as String,
        fundId: json['fundId'] as String,
        recipientId: json['recipientId'] as String,
        purpose: json['purpose'] as String,
        status: json['status'] as String,
        requesterId: json['requesterId'] as String,
        createdAt: json['createdAt'] as String,
        recipient: json['recipient'] != null
            ? PayoutRecipientModel.fromJson(json['recipient'] as Map<String, dynamic>)
            : null,
        approvals: json['approvals'] != null
            ? (json['approvals'] as List)
                .map((e) => PayoutApprovalModel.fromJson(e as Map<String, dynamic>))
                .toList()
            : null,
      );

  final String id;
  final String amountValue;
  final String currency;
  final String fundId;
  final String recipientId;
  final String purpose;
  final String status;
  final String requesterId;
  final String createdAt;
  final PayoutRecipientModel? recipient;
  final List<PayoutApprovalModel>? approvals;
}
