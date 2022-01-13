// 初始化菜单栏
function initMenu() {
    if (window.innerWidth < 1000) {
        return;
    } else {
        new $menu({
            contentEl: 'content-wrapper',
            catalogEl: `menu-wrapper`,
            selector: ['h1', 'h2', 'h3', 'h4', 'h5']
        });
    }
}

// sharejs
function share() {
    let shareBtn = document.querySelector("#share .social-share");
    if (!shareBtn) return;
    let titleElement = document.querySelector(".title-wrapper .post-title p");
    if (!titleElement) return;
    let titleText = titleElement.innerHTML;
    shareBtn.setAttribute("data-description", `云芒的博客： ${titleText}`);
}

function initREM() {
    let htmlElement = document.querySelector("html");
    let winWidth = window.innerWidth;
    htmlElement.style.fontSize = winWidth / 100 + "px";
    console.log(htmlElement.style.fontSize );
}

function fmtArcitle() {
    const heti = new Heti('.heti');
    heti.autoSpacing(); // 自动进行中西文混排美化和标点挤压
}


function imagewapperEvt(){
    let imageWrapperEle = document.querySelector('.hd.posts .image-wrapper');
    if(!imageWrapperEle) return;
    imageWrapperEle.onclick = function(){
        window.location.href = window.location.origin;
    }

    window.addEventListener('scroll', function(e) {
        let y = window.scrollY;
        if(y > 600){
            imageWrapperEle.style.transform = 'translate(0,0)';
        }else{
            imageWrapperEle.style.transform = ' translate(0,-100%)';
        }
    });
}

function bindEvent() {
    initMenu();
    share();
    initREM();
    imagewapperEvt();
}


bindEvent()
