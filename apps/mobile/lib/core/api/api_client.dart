import 'package:dio/dio.dart';

import '../storage/token_storage.dart';
import 'api_exception.dart';
import 'base_url_resolver.dart';

/// The one place a request to the NestJS API is ever made — every
/// repository goes through this, same reasoning as the admin console's
/// apiFetch: auth-header handling and error shaping aren't duplicated per
/// call site. Unlike the admin console, this app *is* the untrusted
/// client (no server-only boundary), so CORS on the API side and a
/// visible bearer token in-transit (over HTTPS in production) are the
/// real security model here, not a hidden cookie.
class ApiClient {
  ApiClient(this._tokenStorage) : dio = Dio(BaseOptions(baseUrl: resolveBaseUrl())) {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _tokenStorage.read();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) {
          handler.reject(_toDioError(error));
        },
      ),
    );
  }

  final Dio dio;
  final TokenStorage _tokenStorage;

  DioException _toDioError(DioException error) {
    final data = error.response?.data;
    String message = error.message ?? 'Something went wrong. Please try again.';
    if (data is Map && data['message'] != null) {
      final m = data['message'];
      message = m is List ? m.join(', ') : m.toString();
    }
    return error.copyWith(
      error: ApiException(error.response?.statusCode, message, body: data),
    );
  }
}

/// Unwraps the ApiException a failed call's DioException carries (see
/// _toDioError above) so repositories can catch a plain ApiException
/// instead of reaching into Dio's own exception shape every time.
extension DioExceptionUnwrap on DioException {
  ApiException toApiException() {
    final err = error;
    if (err is ApiException) return err;
    return ApiException(response?.statusCode, message ?? 'Something went wrong.');
  }
}
