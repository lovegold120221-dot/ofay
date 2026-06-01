import 'dart:convert';
import 'package:http/http.dart' as http;

class HttpService {
  Future<Map<String, dynamic>> post(String url, {Map<String, dynamic>? body}) async {
    final response = await http.post(
      Uri.parse(url),
      headers: {'Content-Type': 'application/json'},
      body: body != null ? jsonEncode(body) : null,
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body);
    } else {
      throw Exception('HTTP Post Failed: ${response.statusCode} ${response.body}');
    }
  }

  Future<Map<String, dynamic>> get(String url) async {
    final response = await http.get(Uri.parse(url));
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body);
    } else {
      throw Exception('HTTP Get Failed: ${response.statusCode}');
    }
  }
}
