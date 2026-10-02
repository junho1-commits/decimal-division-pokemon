"""usage: python compose.py OUT_DIR FINAL_MP4 [--shift SEC]  -- mixes narration at recorded offsets and muxes with the screen recording."""
import glob, json, os, subprocess, sys
import imageio_ffmpeg
out, final = sys.argv[1], sys.argv[2]
shift = float(sys.argv[sys.argv.index('--shift') + 1]) if '--shift' in sys.argv else 0.0
ff = imageio_ffmpeg.get_ffmpeg_exe()
tl = json.load(open(os.path.join(out, 'timeline.json')))
video = max(glob.glob(os.path.join(out, 'rec', '*.webm')), key=os.path.getmtime)
cmd = [ff, '-y', '-i', video]
for _, wav in tl['events']:
    cmd += ['-i', wav]
parts, labels = [], []
for i, (off, _) in enumerate(tl['events'], start=1):
    ms = max(0, int((off + shift) * 1000))
    parts.append(f'[{i}:a]aresample=44100,aformat=channel_layouts=mono,adelay={ms}|{ms}[a{i}]')
    labels.append(f'[a{i}]')
parts.append(''.join(labels) + f'amix=inputs={len(labels)}:normalize=0:dropout_transition=0,volume=1.6,aformat=channel_layouts=stereo[aout]')
cmd += ['-filter_complex', ';'.join(parts), '-map', '0:v', '-map', '[aout]',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '25',
        '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', final]
subprocess.run(cmd, check=True)
print('wrote', final)
