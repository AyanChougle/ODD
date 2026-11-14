import os

repo_dir = r'D:\AYAN\odd-perfume'

for root, dirs, files in os.walk(repo_dir):
    if '.git' in root or 'node_modules' in root:
        continue
    for f in files:
        if f.endswith(('.html', '.js', '.css', '.php')):
            p = os.path.join(root, f)
            with open(p, 'rb') as fl:
                raw = fl.read()
            text = raw.decode('utf-8', errors='ignore')
            found = []
            for m in ['Â·', 'Ã—', 'â€”', 'â€™', 'â€œ', 'â€', 'â€¢', 'Â']:
                cnt = text.count(m)
                if cnt > 0:
                    found.append(f'{m}:{cnt}')
            if found:
                print(f'{os.path.relpath(p, repo_dir)}: {", ".join(found)}')
