import zlib
import struct
import math
import os

def create_gemini_icon(size):
    width = size
    height = size
    pixels = []

    # Center and radius
    cx = width / 2.0
    cy = height / 2.0
    r = size * 0.46

    for y in range(height):
        row = []
        for x in range(width):
            dx = x - cx + 0.5
            dy = y - cy + 0.5
            dist = math.sqrt(dx*dx + dy*dy)

            # Circle mask with anti-aliasing
            if dist > r:
                if dist < r + 1.0:
                    alpha_circle = 1.0 - (dist - r)
                else:
                    alpha_circle = 0.0
            else:
                alpha_circle = 1.0

            if alpha_circle <= 0:
                row.extend([0, 0, 0, 0])
                continue

            # Background gradient: Deep blue/purple (#1A1B35 -> #2F54EB)
            t = (x + y) / (width + height)
            bg_r = int(24 + t * 25)
            bg_g = int(32 + t * 60)
            bg_b = int(72 + t * 160)

            # Draw 4-point sparkle star in the center
            # Star shape: points at (0, -s), (0, s), (-s, 0), (s, 0) with curve pinching at origin
            # Formula: (dx/s)^p + (dy/s)^p <= 1 for p around 0.5 - 0.7
            star_s = size * 0.32
            adx = abs(dx)
            ady = abs(dy)
            
            # Distance metric for 4-point star astroid:
            if star_s > 0:
                # astroid equation: (x/a)^(2/3) + (y/a)^(2/3) <= 1
                p = 0.65
                star_val = (adx / star_s)**p + (ady / star_s)**p
            else:
                star_val = 2.0

            if star_val <= 1.0:
                # Inside star
                edge_dist = 1.0 - star_val
                star_alpha = min(1.0, edge_dist * 4.0)
                # Star color: glowing white-cyan-blue gradient
                st_r = 255
                st_g = int(240 + 15 * (1.0 - star_val))
                st_b = 255
                
                # Blend star over bg
                out_r = int(bg_r * (1 - star_alpha) + st_r * star_alpha)
                out_g = int(bg_g * (1 - star_alpha) + st_g * star_alpha)
                out_b = int(bg_b * (1 - star_alpha) + st_b * star_alpha)
            elif star_val <= 1.4:
                # Soft glow around star
                glow = (1.4 - star_val) / 0.4 * 0.45
                out_r = int(min(255, bg_r + 140 * glow))
                out_g = int(min(255, bg_g + 180 * glow))
                out_b = int(min(255, bg_b + 255 * glow))
            else:
                out_r = bg_r
                out_g = bg_g
                out_b = bg_b

            out_a = int(alpha_circle * 255)
            row.extend([out_r, out_g, out_b, out_a])
        pixels.append(bytes(row))

    # Raw image data with 0 filter byte at start of each scanline
    raw_data = b"".join(b"\x00" + row for row in pixels)

    # PNG chunks
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)

    png_header = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(raw_data, 9)

    return png_header + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")

os.makedirs("icons", exist_ok=True)
for sz in [16, 48, 128]:
    data = create_gemini_icon(sz)
    with open(f"icons/icon-{sz}.png", "wb") as f:
        f.write(data)
    print(f"Generated icons/icon-{sz}.png ({sz}x{sz}, {len(data)} bytes)")
