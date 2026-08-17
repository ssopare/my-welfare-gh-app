import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/member_statement.dart';
import '../../core/providers.dart';

class StatementRepository {
  StatementRepository(this._api);

  final ApiClient _api;

  Future<MemberStatement> load(String memberId) async {
    final res = await _api.dio.get('/members/$memberId/statement');
    return MemberStatement.fromJson(res.data as Map<String, dynamic>);
  }
}

final statementRepositoryProvider = Provider<StatementRepository>((ref) {
  return StatementRepository(ref.watch(apiClientProvider));
});
