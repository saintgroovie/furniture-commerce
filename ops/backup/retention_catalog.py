#!/usr/bin/env python3
"""Stable archive chronology and fail-closed preservation pins. No mutations."""
import datetime,json,os,re,stat,sys
from pathlib import Path

def timestamp(name,manifest=False):
    pattern=r'^recovery-point-(\d{8}T\d{6}Z)\.json$' if manifest else r'^woodright_[A-Za-z0-9_]+_(\d{8}T\d{6}Z)\.(?:dump|tar\.gz)$'
    match=re.fullmatch(pattern,name)
    if not match:return None
    try:datetime.datetime.strptime(match[1],'%Y%m%dT%H%M%SZ')
    except ValueError:return None
    return match[1]

def ordinary(path):
    try:return stat.S_ISREG(path.lstat().st_mode)
    except FileNotFoundError:return False

def chronological(directory,pattern,manifest=False):
    root=Path(directory)
    if root.is_symlink() or not root.is_dir():raise ValueError('unsafe catalog directory')
    rows=[]
    for path in root.glob(pattern):
        stamp=timestamp(path.name,manifest)
        if not stamp or not ordinary(path):continue
        if not manifest and not ordinary(Path(str(path)+'.sha256')):continue
        rows.append((stamp,path.name,str(path)))
    return [p for _,_,p in sorted(rows,reverse=True)]

def pins(path,root):
    root=Path(root)
    if root.is_symlink() or not root.is_dir():raise ValueError('unsafe pin root')
    path=Path(path)
    if not ordinary(path) or path.is_symlink():raise ValueError('unsafe or missing pin file')
    resolved=root.resolve();path.resolve().relative_to(resolved)
    d=json.loads(path.read_text())
    if d.get('schema_version')!=1 or d.get('backup_root')!=str(root):raise ValueError('pin schema/root mismatch')
    if not isinstance(d.get('protected_relative_paths'),list):raise ValueError('missing pin list')
    out=[]
    for rel in d['protected_relative_paths']:
        if not isinstance(rel,str) or not rel or '\n' in rel or '\r' in rel or Path(rel).is_absolute() or '..' in Path(rel).parts:raise ValueError('invalid pin path')
        target=root/rel;target.resolve().relative_to(resolved)
        # Do not accept a symlink in any existing parent; missing future objects can still be pinned.
        cursor=root
        for part in Path(rel).parts:
            cursor=cursor/part
            if cursor.is_symlink():raise ValueError('symlink pin path')
        out.append(str(target))
    return sorted(set(out))

def main():
    cmd=sys.argv[1]
    if cmd=='complete':values=chronological(sys.argv[2],sys.argv[3])
    elif cmd=='manifests':values=chronological(sys.argv[2],'recovery-point-*.json',True)
    elif cmd=='pins':values=pins(sys.argv[2],sys.argv[3])
    else:raise ValueError('unsupported catalog command')
    for value in values:print(value)
if __name__=='__main__':main()
