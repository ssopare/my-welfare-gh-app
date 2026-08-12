// Conditional export — the standard Dart idiom for code that needs a
// different implementation on web vs. native, since merely *importing*
// dart:io (the io variant needs it for Platform.isAndroid) is a hard
// compile error on web, not just a runtime concern. Web is the default
// branch; dart.library.io being available (native platforms) swaps it in.
export 'base_url_resolver_web.dart'
    if (dart.library.io) 'base_url_resolver_io.dart';
