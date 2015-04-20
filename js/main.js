$(document).ready(function(){

	// Preloader Calls

	startLoader();

    // Home nav buttons
    $('#preloader').bind('inview', function(event, isInView) {
        if (isInView) {
        // element is now visible in the viewport
            $('.previous-page').removeClass('active');
            setTimeout(function() {
                $('.previous-page').addClass('hidden');
            }, 300);
        } else {
        // element has gone out of viewport
            $('.previous-page').removeClass('hidden');
            setTimeout(function() {
                $('.previous-page').addClass('active');
            }, 300);
        }
    });

    $('#contactPage').bind('inview', function(event, isInView) {
        if (isInView) {
        // element is now visible in the viewport
            $('.next-page').removeClass('active');
            setTimeout(function() {
                $('.next-page').addClass('hidden');
            }, 300);
        } else {
        // element has gone out of viewport
            $('.next-page').removeClass('hidden');
            setTimeout(function() {
                $('.next-page').addClass('active');
            }, 300);
        }
    });

    $('.next-page').click(homeScrollDown);
    $('.previous-page').click(homeScrollUp);


	// Init Functions

	setHeight();
	fullPageInit();

});


// ----- Preloader

function startLoader() {

    var loader = new PxLoader(),
        Img  = loader.addImage('http://itshamish.com/thevitalbowl/img/muesli-bg2.jpg'),
        ImgEh = loader.addImage('http://itshamish.com/thevitalbowl/img/muesli-bg5.jpg'),
        ImgOne = loader.addImage('http://itshamish.com/thevitalbowl/img/page3-lrg.jpg'), 
        ImgTwo = loader.addImage('http://itshamish.com/thevitalbowl/img/page4-lrg.jpg');

     
    // callback that will be run once images are ready 
    loader.addCompletionListener(function() { 
	    
    	//setTimeout(function() {
	        $('.preloader').addClass('loaded');
            $('.inner-wrap').removeClass('hidden');
            $('.right-nav').removeClass('hidden');
            $('.fullpage-wrapper').addClass('loaded');
            $('.page-group').removeClass('hidden');
            $('.next-page').removeClass('hidden');

            setTimeout(function () {
                $('.next-page').addClass('loaded');
            }, 10);

            setTimeout(function () {
                $('.right-nav').addClass('active');
            }, 500);

	        //preloaderScroll();

	    	console.log("loaded");

    	//}, 2500);
        
    });

    loader.start();

};


// ----- Window Height Objects

function setHeight() {

    var windowHeight = $(window).innerHeight();

    $('.full-height').css('height', windowHeight);
    $('.min-full-height').css('min-height', windowHeight);

};
  
$(window).resize(function() {
    setHeight();

    if( $('.scroll-catch').height() > 1 ) {
    	preloaderScroll();
    };
    
});


function homeScrollDown() {

    var y = $(window).scrollTop();  //your current y position on the page
    windowHeight = $(window).innerHeight();

    $('html,body').animate({ scrollTop: y + windowHeight }, 800, 'easeInOutQuint' );

};
function homeScrollUp() {

    var y = $(window).scrollTop();  //your current y position on the page
    windowHeight = $(window).innerHeight();

    $('html,body').animate({ scrollTop: y - windowHeight }, 800, 'easeInOutQuint' );

};


function fullPageInit() {
	$('#fullpage').fullpage({

        //Navigation
        menu: '#menu',
        anchors:['preloaderPage', '1stPage', '2ndPage', '3rdPage', '4thPage', '5thPage', 'contact'],

        // //Scrolling
        css3: true,
        scrollingSpeed: 700,
        autoScrolling: true,
        // fitToSection: true,
        scrollBar: true,
        easing: 'easeInOutCubic',
        easingcss3: 'ease',
        loopBottom: false,
        loopTop: false,
        //normalScrollElements: '.preloader',
        scrollOverflow: true,
        touchSensitivity: 8,
        normalScrollElementTouchThreshold: 5,

        //Accessibility
        keyboardScrolling: true,
        animateAnchor: true,
        recordHistory: false,

        loopHorizontal: true,
        //slidesNavigation: true,
        //slidesNavPosition: 'bottom',
        //controlArrows: true,

        // //Design
        // controlArrows: true,
        verticalCentered: true
        // resize : false,
        // //sectionsColor : ['#ccc', '#fff'],
        // paddingTop: '3em',
        // paddingBottom: '10px',
        //responsive: 720

    });

};