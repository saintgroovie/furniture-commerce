#!/usr/bin/env python3
"""No-clobber weekly copy; existing hardlinked aliases stay byte/metadata unchanged."""
import os,sys,hashlib,stat
from pathlib import Path

def digest(p):
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW);before=os.fstat(fd);h=hashlib.sha256()
    try:
        if not stat.S_ISREG(before.st_mode):raise ValueError('not regular')
        while b:=os.read(fd,1024*1024):h.update(b)
        after=os.fstat(fd)
        if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns):raise ValueError('file changed')
    finally:os.close(fd)
    return h.hexdigest(),before

def publish(source,target,sha):
    source=Path(source);target=Path(target)
    if source.is_symlink() or target.is_symlink() or target.parent.is_symlink():raise ValueError('symlink refused')
    actual,metadata=digest(source)
    if actual!=sha:raise ValueError('source SHA mismatch')
    try:fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,stat.S_IMODE(metadata.st_mode))
    except FileExistsError:
        old,_=digest(target)
        if old!=sha:raise ValueError('existing weekly differs; preserved')
    else:
        try:
            src=os.open(source,os.O_RDONLY|os.O_NOFOLLOW)
            try:
                while b:=os.read(src,1024*1024):
                    view=memoryview(b)
                    while view:view=view[os.write(fd,view):]
            finally:os.close(src)
            os.fchmod(fd,stat.S_IMODE(metadata.st_mode));os.fchown(fd,metadata.st_uid,metadata.st_gid);os.fsync(fd)
        finally:os.close(fd)
        if digest(target)[0]!=sha:raise ValueError('new weekly incomplete; preserved for inspection')
    sidecar=Path(str(target)+'.sha256');data=(sha+'  '+target.name+'\n').encode()
    try:fd=os.open(sidecar,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    except FileExistsError:
        if sidecar.is_symlink() or sidecar.read_bytes()!=data:raise ValueError('existing weekly checksum differs; preserved')
    else:
        try:
            view=memoryview(data)
            while view:view=view[os.write(fd,view):]
            os.fsync(fd)
        finally:os.close(fd)
    directory=os.open(target.parent,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(directory)
    finally:os.close(directory)
if __name__=='__main__':publish(*sys.argv[1:])
