PORTNAME=	formvis
DISTVERSION=	1.90.7
CATEGORIES=	graphics python
MASTER_SITES=	https://github.com/nodemode-ai/formcompiler/releases/download/formvis-v${DISTVERSION}/
DISTFILES=	formvis-web.tar.gz
DIST_SUBDIR=	${PORTNAME}-${DISTVERSION}

MAINTAINER=	mackin@nodemode.ai
COMMENT=	Layered image editor: the engine and the web page
WWW=		https://github.com/nodemode-ai/formvis

LICENSE=	APACHE20

RUN_DEPENDS=	${PYTHON_PKGNAMEPREFIX}fastapi>0:www/py-fastapi@${PY_FLAVOR} \
		${PYTHON_PKGNAMEPREFIX}numpy>=0:math/py-numpy@${PY_FLAVOR} \
		${PYTHON_PKGNAMEPREFIX}pillow>=0:graphics/py-pillow@${PY_FLAVOR} \
		${PYTHON_PKGNAMEPREFIX}python-multipart>0:www/py-python-multipart@${PY_FLAVOR} \
		${PYTHON_PKGNAMEPREFIX}uvicorn>0:www/py-uvicorn@${PY_FLAVOR}

USES=		python:3.11+
NO_ARCH=	yes
NO_BUILD=	yes
WRKSRC=		${WRKDIR}

post-patch:
	${REINPLACE_CMD} -e 's|python3|${PYTHON_CMD}|' ${WRKSRC}/usr/bin/formvis

do-install:
	${MKDIR} ${STAGEDIR}${PREFIX}/lib/formvis ${STAGEDIR}${PREFIX}/share/applications
	cd ${WRKSRC}/usr/lib/formvis && ${COPYTREE_SHARE} . ${STAGEDIR}${PREFIX}/lib/formvis
	${INSTALL_SCRIPT} ${WRKSRC}/usr/bin/formvis ${STAGEDIR}${PREFIX}/bin/formvis
	${INSTALL_DATA} ${WRKSRC}/usr/share/applications/ai.nodemode.formvis.desktop ${STAGEDIR}${PREFIX}/share/applications/

post-install:
	cd ${STAGEDIR}${PREFIX} && ${FIND} -s lib/formvis -type f >> ${TMPPLIST}

.include <bsd.port.mk>
