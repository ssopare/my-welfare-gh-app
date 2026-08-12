import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/benefit_rule.dart';
import '../../core/models/claim.dart';
import '../../core/models/eligibility_check.dart';
import '../../core/providers.dart';
import 'claim_ineligible_exception.dart';

class ClaimsRepository {
  ClaimsRepository(this._api);

  final ApiClient _api;

  Future<List<Claim>> listForMember(String memberId) async {
    final res = await _api.dio.get('/members/$memberId/claims');
    return (res.data as List).map((e) => Claim.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<BenefitRule>> listActiveBenefits() async {
    final res = await _api.dio.get('/benefit-rules');
    return (res.data as List).map((e) => BenefitRule.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> submit({
    required String benefitRuleId,
    required String memberId,
    required DateTime eventDate,
    List<Map<String, String>>? evidence,
  }) async {
    try {
      await _api.dio.post('/benefit-rules/$benefitRuleId/claims', data: {
        'memberId': memberId,
        'eventDate': eventDate.toIso8601String(),
        if (evidence != null && evidence.isNotEmpty) 'evidence': evidence,
      });
    } on DioException catch (error) {
      final data = error.response?.data;
      if (data is Map && data['checks'] is List) {
        final checks = (data['checks'] as List)
            .map((e) => EligibilityCheck.fromJson(e as Map<String, dynamic>))
            .toList();
        final message = data['message']?.toString() ?? 'Not eligible for this benefit.';
        throw ClaimIneligibleException(message, checks);
      }
      rethrow;
    }
  }
}

final claimsRepositoryProvider = Provider<ClaimsRepository>((ref) {
  return ClaimsRepository(ref.watch(apiClientProvider));
});
