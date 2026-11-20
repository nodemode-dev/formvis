import './shim/api';
import './pages';
import '../../frontend/src/main';
import { mountLinks } from './links';
import { openSession } from './session';

mountLinks();
openSession();
