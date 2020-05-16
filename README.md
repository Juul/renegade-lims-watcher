
Work-in-progress NW.js app meant to run on Windows and watch a folder for new/updated files, then report them to a [renegade-lims](https://github.com/renegadebio/renegade-lims) node.


# Installation

You should install a released .exe file. 

# Setup

If you are not a developer go find a released .exe file instead.

First download the [NW.js SDK](https://nwjs.io/) and extract it, e.g. to `/opt/nwjs`, then:

```
npm install
cp settings.sh.example settings.sh
cp settings.json.example settings.json
```

Edit `settings.sh` and `settings.json` to suit your needs.

## TLS certificates

First generate your local certificates:

```
./scripts/gen_cert.sh
```

If you are using this locally on the same machine as `renegade-lims` then the hostname should probably just be `localhost`.

Now copy the server's cert to `tls/server-cert.pem` and copy `tls/cert.pem` to the appropriate place on the server.

# Running

```
./run.sh
```

# Restart on crash

Use [this nifty utility](https://w-shadow.com/blog/2009/03/04/restart-on-crash/).