import os

ECS_URL = os.environ.get('REBASE_ECS_URL', 'http://8.217.242.191:3000')
API_SECRET = os.environ.get('REBASE_API_SECRET', '')
AGENT_ID = os.environ.get('REBASE_AGENT_ID', f"{os.environ.get('USER', 'agent')}-{os.uname().nodename}")
PLATFORMS = [p.strip() for p in os.environ.get('REBASE_PLATFORMS', 'xhs').split(',')]
PROFILE_DIR = os.environ.get('REBASE_PROFILE_DIR', os.path.expanduser('~/.rebase-scraper'))
MIN_DELAY = float(os.environ.get('REBASE_MIN_DELAY', '3'))
MAX_DELAY = float(os.environ.get('REBASE_MAX_DELAY', '8'))
SKIP_HOURS = float(os.environ.get('REBASE_SKIP_HOURS', '20'))
DRY_RUN = os.environ.get('REBASE_DRY_RUN', '').lower() in ('1', 'true', 'yes')
