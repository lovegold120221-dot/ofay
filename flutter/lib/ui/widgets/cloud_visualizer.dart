import 'dart:math' as math;
import 'package:flutter/material.dart';

class CloudPuff {
  final double cx;
  final double cy;
  final double r;
  final double phaseX;
  final double phaseY;
  final double speedX;
  final double speedY;
  final double alpha;
  final String tint;

  CloudPuff({
    required this.cx,
    required this.cy,
    required this.r,
    required this.phaseX,
    required this.phaseY,
    required this.speedX,
    required this.speedY,
    required this.alpha,
    required this.tint,
  });
}

class CloudVisualizer extends StatefulWidget {
  final double avg;
  final double peak;
  final bool isActive;

  const CloudVisualizer({
    super.key,
    required this.avg,
    required this.peak,
    required this.isActive,
  });

  @override
  State<CloudVisualizer> createState() => _CloudVisualizerState();
}

class _CloudVisualizerState extends State<CloudVisualizer> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  
  final List<CloudPuff> _puffs = [
    CloudPuff(cx: 0.30, cy: 0.46, r: 0.22, phaseX: 0.2, phaseY: 1.4, speedX: 0.18, speedY: 0.15, alpha: 0.64, tint: 'peach'),
    CloudPuff(cx: 0.45, cy: 0.39, r: 0.26, phaseX: 2.1, phaseY: 0.7, speedX: 0.16, speedY: 0.18, alpha: 0.72, tint: 'cream'),
    CloudPuff(cx: 0.61, cy: 0.44, r: 0.24, phaseX: 3.0, phaseY: 2.5, speedX: 0.19, speedY: 0.14, alpha: 0.66, tint: 'peach'),
    CloudPuff(cx: 0.39, cy: 0.58, r: 0.25, phaseX: 4.4, phaseY: 1.1, speedX: 0.14, speedY: 0.20, alpha: 0.62, tint: 'amber'),
    CloudPuff(cx: 0.55, cy: 0.59, r: 0.28, phaseX: 1.7, phaseY: 4.1, speedX: 0.17, speedY: 0.16, alpha: 0.70, tint: 'cream'),
    CloudPuff(cx: 0.70, cy: 0.55, r: 0.19, phaseX: 5.1, phaseY: 3.6, speedX: 0.23, speedY: 0.17, alpha: 0.48, tint: 'peach'),
    CloudPuff(cx: 0.23, cy: 0.61, r: 0.17, phaseX: 3.7, phaseY: 5.2, speedX: 0.22, speedY: 0.19, alpha: 0.46, tint: 'amber'),
    CloudPuff(cx: 0.50, cy: 0.50, r: 0.33, phaseX: 0.9, phaseY: 2.8, speedX: 0.10, speedY: 0.12, alpha: 0.42, tint: 'peach'),
    CloudPuff(cx: 0.34, cy: 0.31, r: 0.14, phaseX: 5.8, phaseY: 0.4, speedX: 0.25, speedY: 0.16, alpha: 0.36, tint: 'cream'),
    CloudPuff(cx: 0.66, cy: 0.31, r: 0.15, phaseX: 2.8, phaseY: 4.8, speedX: 0.21, speedY: 0.18, alpha: 0.38, tint: 'cream'),
    CloudPuff(cx: 0.32, cy: 0.73, r: 0.12, phaseX: 1.2, phaseY: 3.2, speedX: 0.20, speedY: 0.24, alpha: 0.32, tint: 'amber'),
    CloudPuff(cx: 0.65, cy: 0.72, r: 0.13, phaseX: 4.7, phaseY: 2.2, speedX: 0.24, speedY: 0.22, alpha: 0.34, tint: 'peach'),
  ];

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(seconds: 10))..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return CustomPaint(
          painter: CloudPainter(
            puffs: _puffs,
            avg: widget.avg,
            peak: widget.peak,
            time: DateTime.now().millisecondsSinceEpoch / 1000,
            isActive: widget.isActive,
          ),
          size: Size.infinite,
        );
      },
    );
  }
}

class CloudPainter extends CustomPainter {
  final List<CloudPuff> puffs;
  final double avg;
  final double peak;
  final double time;
  final bool isActive;

  CloudPainter({
    required this.puffs,
    required this.avg,
    required this.peak,
    required this.time,
    required this.isActive,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final double w = size.width;
    final double h = size.height;
    final double energy = (avg * 1.35 + peak * 0.95).clamp(0.0, 1.0);
    final double breath = 0.96 + math.sin(time * 1.4) * 0.025 + energy * 0.22;

    // Background Mist
    final Paint mistPaint = Paint()
      ..shader = RadialGradient(
        colors: [
          Color.fromRGBO(255, 239, 229, 0.10 + energy * 0.18),
          Color.fromRGBO(208, 167, 139, 0.08 + energy * 0.12),
          Colors.transparent,
        ],
        stops: const [0.0, 0.45, 1.0],
      ).createShader(Rect.fromCircle(center: Offset(w * 0.5, h * 0.52), radius: w * (0.44 + energy * 0.16)));
    
    canvas.drawRect(Rect.fromLTWH(0, 0, w, h), mistPaint);

    // Draw Puffs
    for (var puff in puffs) {
      final double driftX = math.sin(time * puff.speedX + puff.phaseX) * (0.035 + energy * 0.055);
      final double driftY = math.cos(time * puff.speedY + puff.phaseY) * (0.025 + energy * 0.04);
      final double x = (puff.cx + driftX) * w;
      final double y = (puff.cy + driftY) * h;
      final double r = puff.r * w * breath;

      final double alpha = (0.12 + energy * 0.56 + peak * 0.16).clamp(0.0, 0.92) * puff.alpha;
      final Map<String, List<int>> colors = _getCloudColor(puff.tint);
      
      final Paint puffPaint = Paint()
        ..blendMode = BlendMode.screen
        ..shader = RadialGradient(
          colors: [
            Color.fromRGBO(colors['core']![0], colors['core']![1], colors['core']![2], alpha),
            Color.fromRGBO(colors['mid']![0], colors['mid']![1], colors['mid']![2], alpha * 0.58),
            Color.fromRGBO(colors['edge']![0], colors['edge']![1], colors['edge']![2], alpha * 0.22),
            Colors.transparent,
          ],
          stops: const [0.0, 0.34, 0.68, 1.0],
        ).createShader(Rect.fromCircle(center: Offset(x, y), radius: r));

      canvas.drawCircle(Offset(x, y), r, puffPaint);
    }

    // Halo
    final Paint haloPaint = Paint()
      ..shader = RadialGradient(
        colors: [
          Color.fromRGBO(255, 247, 240, 0.10 + energy * 0.12),
          Color.fromRGBO(208, 167, 139, 0.06 + energy * 0.11),
          Colors.transparent,
        ],
        stops: const [0.0, 0.52, 1.0],
      ).createShader(Rect.fromCircle(center: Offset(w * 0.48, h * 0.42), radius: w * 0.48));
    
    canvas.drawRect(Rect.fromLTWH(0, 0, w, h), haloPaint);
  }

  Map<String, List<int>> _getCloudColor(String tint) {
    if (tint == 'cream') return {'core': [255, 241, 232], 'mid': [235, 208, 188], 'edge': [208, 167, 139]};
    if (tint == 'amber') return {'core': [236, 189, 154], 'mid': [208, 167, 139], 'edge': [151, 104, 78]};
    return {'core': [248, 220, 202], 'mid': [208, 167, 139], 'edge': [171, 123, 96]};
  }

  @override
  bool shouldRepaint(covariant CloudPainter oldDelegate) => true;
}
