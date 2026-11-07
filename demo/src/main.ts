import './shim/api';
import '../../frontend/src/main';
import { mountLinks } from './links';
import { openSession } from './session';

mountLinks();
openSession();
