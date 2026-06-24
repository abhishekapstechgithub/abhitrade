import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../config/constants.dart';

class WebSocketService {
  WebSocketService._();
  static final WebSocketService instance = WebSocketService._();

  WebSocketChannel? _channel;
  bool _isConnected = false;
  bool _connecting = false;

  final _tickController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get ticks => _tickController.stream;

  final Set<String> _subscribed = {};
  Timer? _reconnectTimer;

  // Build the WebSocket URL from apiBase without relying on Uri.hasPort,
  // which returns false for standard ports and causes Dart to emit port 0.
  static String get _wsUrl {
    final base = AppConstants.apiBase
        .replaceFirst(RegExp(r'^https?://'), '')
        .split('/')
        .first;
    final scheme = AppConstants.apiBase.startsWith('https') ? 'wss' : 'ws';
    return '$scheme://$base/ws/stream';
  }

  void subscribe(List<String> tokens) {
    _subscribed.addAll(tokens);
    if (!_isConnected) {
      _connect();
    } else {
      _send({'type': 'subscribe', 'tokens': tokens});
    }
  }

  void unsubscribe(List<String> tokens) {
    _subscribed.removeAll(tokens);
    if (_isConnected) {
      _send({'type': 'unsubscribe', 'tokens': tokens});
    }
  }

  void _connect() {
    if (_connecting || _isConnected) return;
    _connecting = true;
    _reconnectTimer?.cancel();

    final url = _wsUrl;
    try {
      _channel = WebSocketChannel.connect(Uri.parse(url));

      // Catch the upgrade-failure exception thrown from the ready future
      // (web_socket_channel v3 throws WebSocketChannelException here when the
      // HTTP → WebSocket handshake is rejected, e.g. when the strategy-api is down).
      _channel!.ready.then((_) {
        _isConnected = true;
        _connecting = false;
        if (_subscribed.isNotEmpty) {
          _send({'type': 'subscribe', 'tokens': _subscribed.toList()});
        }
      }).catchError((Object e) {
        _isConnected = false;
        _connecting = false;
        _scheduleReconnect();
      });

      _channel!.stream.listen(
        _onMessage,
        onDone: _onClose,
        onError: _onError,
        cancelOnError: true,
      );
    } catch (_) {
      _isConnected = false;
      _connecting = false;
      _scheduleReconnect();
    }
  }

  void _onMessage(dynamic raw) {
    try {
      final map = jsonDecode(raw as String) as Map<String, dynamic>;
      _tickController.add(map);
    } catch (_) {}
  }

  void _onClose() {
    _isConnected = false;
    _connecting = false;
    _scheduleReconnect();
  }

  void _onError(Object _) {
    _isConnected = false;
    _connecting = false;
    _scheduleReconnect();
  }

  void _send(Map<String, dynamic> payload) {
    try {
      _channel?.sink.add(jsonEncode(payload));
    } catch (_) {}
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 2), _connect);
  }

  void disconnect() {
    _reconnectTimer?.cancel();
    _isConnected = false;
    _connecting = false;
    _channel?.sink.close();
    _channel = null;
  }
}
